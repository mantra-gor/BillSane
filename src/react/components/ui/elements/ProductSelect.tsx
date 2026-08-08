import AsyncCreatableSelect from "react-select/async-creatable";
import { formatINR } from "../../../utils/format";
import {
  formatStock,
  searchProductsDebounced,
  stockLevel,
  type ProductOption,
} from "../../../utils/productStore";

/**
 * react-select's option shape. `value` is a string for both cases — a product's
 * id, or the raw text of the "add this" entry — so the built-in create option
 * needs no custom data factory.
 */
interface ItemOption {
  value: string;
  label: string;
  product?: ProductOption;
}

interface ProductSelectProps {
  /** The line's current item. `productId` is null until one is picked. */
  value: { productId: number | null; name: string };
  /** Free text — the operator is typing something the catalog may not have. */
  onType: (name: string) => void;
  /** A catalog item was chosen; the caller prefills the rest of the row. */
  onPick: (product: ProductOption) => void;
  placeholder?: string;
}

const STOCK_TONE: Record<ReturnType<typeof stockLevel>, string> = {
  uncounted: "text-ink-faint",
  oversold: "text-danger",
  out: "text-danger",
  low: "text-warning",
  ok: "text-ink-faint",
};

function loadOptions(input: string): Promise<ItemOption[]> {
  return searchProductsDebounced(input).then((products) =>
    products.map((product) => ({
      value: String(product.id),
      label: product.name,
      product,
    }))
  );
}

/** The rich menu row: what it is, then what it costs and how many are left. */
function OptionLabel({ option }: { option: ItemOption }) {
  const product = option.product;
  if (!product) {
    // The "add this as a new item" entry — label already reads as a sentence.
    return <span className="text-[13px] font-medium text-munsell_blue-700">{option.label}</span>;
  }

  const detail = [
    product.rate !== null ? formatINR(product.rate) : null,
    product.sku,
    product.hsnCode ? `HSN ${product.hsnCode}` : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-ink">{product.name}</p>
        {detail.length > 0 && (
          <p className="truncate text-[11px] text-ink-muted tnum">
            {detail.join(" · ")}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 text-[11px] font-semibold tnum ${STOCK_TONE[stockLevel(product)]}`}>
        {formatStock(product)}
      </span>
    </div>
  );
}

/**
 * The item cell on an invoice line: search the catalog, or just type.
 *
 * Deliberately never renders a "selected value" chip — the control is always a
 * plain text box showing the item name, whether that name came from the catalog
 * or from the operator's fingers. At a counter, a control that swaps between an
 * input and a token as you tab through it is a control you fight; and the whole
 * point here is that *not* picking anything is a legitimate path, because the
 * invoice adds whatever was typed to the inventory when it saves.
 */
function ProductSelect({
  value,
  onType,
  onPick,
  placeholder = "Product or service name",
}: ProductSelectProps) {
  return (
    <AsyncCreatableSelect<ItemOption>
      unstyled
      // The rows sit inside an `overflow-x-auto` scroller, which would clip an
      // inline menu — the list has to escape to the body.
      menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
      styles={{ menuPortal: (base) => ({ ...base, zIndex: 60 }) }}
      // The name on the line *is* the input; react-select is only searching it.
      value={null}
      controlShouldRenderValue={false}
      inputValue={value.name}
      onInputChange={(text, meta) => {
        // Ignore the blur/menu-close clears react-select fires on its own —
        // acting on those would wipe a name the operator just typed.
        if (meta.action === "input-change") onType(text);
      }}
      loadOptions={loadOptions}
      // The search already ran in SQL; re-filtering here would only hide rows
      // matched on sku or code.
      filterOption={null}
      onChange={(option) => {
        if (option?.product) onPick(option.product);
      }}
      // Choosing "add this" needs no state change — the text is already on the
      // line. This exists so the entry closes the menu instead of selecting.
      onCreateOption={onType}
      formatCreateLabel={(input) => `Add "${input}" as a new item`}
      formatOptionLabel={(option) => <OptionLabel option={option} />}
      placeholder={placeholder}
      isClearable={false}
      blurInputOnSelect={false}
      // Removed outright rather than hidden with a class: `unstyled` still
      // injects emotion rules for these, and an emotion `display: flex` wins
      // over a Tailwind `hidden`. A chevron in one grid column and none in the
      // other five would read as a different kind of control anyway.
      components={{ DropdownIndicator: null, IndicatorSeparator: null }}
      noOptionsMessage={({ inputValue }) =>
        inputValue ? "Nothing in inventory matches" : "Type to search your inventory"
      }
      loadingMessage={() => "Searching…"}
      classNames={{
        container: () => "w-full",
        control: ({ isFocused }) =>
          [
            "h-9 w-full cursor-text rounded-lg border px-2.5 text-sm transition-colors",
            isFocused
              ? "border-munsell_blue bg-surface ring-[3px] ring-munsell_blue/15"
              : "border-transparent bg-transparent hover:border-line",
          ].join(" "),
        valueContainer: () => "gap-0 p-0",
        // `!opacity-100` overrides an inline `opacity: 0` react-select applies
        // after a selection — it assumes a value chip has taken over, but here
        // the input *is* the value, so hiding it blanks the cell.
        input: () =>
          "m-0 w-full p-0 text-sm font-medium text-ink [&_input]:!opacity-100 [&_input]:outline-none",
        placeholder: () => "truncate text-sm text-ink-faint",
        menu: () =>
          "mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-pop",
        menuList: () => "max-h-64 py-1",
        option: ({ isFocused }) =>
          `cursor-pointer px-3 py-2 ${isFocused ? "bg-munsell_blue-5" : ""}`,
        noOptionsMessage: () => "px-3 py-3 text-[13px] text-ink-muted",
        loadingMessage: () => "px-3 py-3 text-[13px] text-ink-muted",
      }}
    />
  );
}

export default ProductSelect;
