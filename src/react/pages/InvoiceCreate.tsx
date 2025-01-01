import { useEffect, useState } from "react";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import Input from "../components/ui/elements/Input";
import LabeledInput from "../components/ui/elements/LabeledInput";
import Button from "../components/ui/elements/Button";
// import { useForm } from "react-hook-form";
// import { DevTool } from "@hookform/devtools";

function InvoiceCreate() {
  const lineItem: LineItem = {
    id: Date.now(),
  };

  const [lineItems, setLineItems] = useState<LineItem[]>([lineItem]);
  const [totalAmount, setTotalAmount] = useState<number | undefined>();
  const [totalTax, setTotalTax] = useState<number | undefined>();
  const [totalDiscount, setTotalDiscount] = useState<number | undefined>();

  const AddLineItem = () => {
    setLineItems((prev) => [...prev, lineItem]);
  };

  const RemoveLineItem = (index: number) => {
    setLineItems((prev) => {
      return prev.filter((_, idx) => index !== idx);
    });
  };

  // const calcTotals = useCallback(() => {
  //   const totalTax = lineItems.reduce((sum, item) => sum + (item.tax ?? 0), 0);
  //   const totalAmount = lineItems.reduce(
  //     (sum, item) => sum + (item.subTotal ?? 0),
  //     0
  //   );
  //   console.log(lineItems.reduce((sum, item) => sum + (item.tax ?? 0), 0));

  //   setTotal(totalTax);
  //   setTotalTax(totalAmount);
  // }, [lineItems]);

  const calcTotals = () => {
    const totalTax = lineItems.reduce((sum, item) => sum + item.tax, 0);
    const totalAmount = lineItems.reduce((sum, item) => sum + item.subTotal, 0);

    setTotalAmount(totalAmount);
    setTotalTax(totalTax);
  };

  useEffect(() => {
    calcTotals();
  }, [lineItems]);

  const handleLineItemChange = (
    index: number,
    field: string,
    value: string | number
  ) => {
    setLineItems((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, [field]: value } : item
      )
    );
  };

  const calcTax = (index: number, rate: number, taxPer: number) => {
    // Calculate the tax
    const tax = (rate * taxPer) / 100;
    // Update the line item with the calculated tax
    handleLineItemChange(index, "tax", tax);
    // calculate sub total
    calcSubTotal(index, rate, tax);
  };

  const calcSubTotal = (
    index: number,
    rate: number,
    tax: number,
    discount?: number
  ) => {
    // Use the provided discount or fallback to the one from lineItems
    const effectiveDiscount = discount ?? lineItems[index].discount;

    // Calculate the subtotal
    const rateWithTax = rate + tax;
    const discountedAmt = (rateWithTax * (effectiveDiscount || 0)) / 100;
    const subTotal = rateWithTax - discountedAmt;
    // Update the line item with the calculated subtotal
    handleLineItemChange(index, "subTotal", subTotal);
  };

  const invoiceCols = [
    {
      width: "350px",
      name: "Item Name",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="text"
            name="itemName"
            placeholder={"Enter Name Here"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleLineItemChange(index, "itemName", e.target.value)
            }
            required={true}
          />
        </div>
      ),
    },
    {
      width: "130px",
      name: "Rate (₹)",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="number"
            name="rate"
            placeholder={"Item Rate"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "rate", value); // Pass as number
              calcTax(index, value, row.taxPer); // Pass as number
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            required={true}
          />
        </div>
      ),
    },
    {
      width: "140px",
      name: "Tax Type",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="text"
            name="taxType"
            placeholder={"Tax Type"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              handleLineItemChange(index, "taxType", e.target.value)
            }
            required={true}
          />
        </div>
      ),
    },
    {
      width: "170px",
      name: "Tax (%)",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="number"
            name="taxPer"
            placeholder={"Tax per item (%)"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "taxPer", value); // Pass as number
              calcTax(index, row.rate, value); // Pass as number
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            required={true}
          />
        </div>
      ),
    },
    {
      width: "170px",
      name: "Discount (%)",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="number"
            name="discount"
            placeholder={"Discount per item"}
            required={true}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "discount", value); // Pass as number
              calcSubTotal(index, row.rate, row.tax, value); // Calc sub total
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
          />
        </div>
      ),
    },
    {
      width: "130px",
      name: "Tax",
      cell: (row: LineItem) => {
        return (
          <div className="w-full">
            <Input
              type="number"
              name="tax"
              placeholder={"Tax"}
              value={row.tax}
              onWheel={(e) => (e.target as HTMLInputElement).blur()}
              required={true}
              disabled
            />
          </div>
        );
      },
    },
    {
      width: "130px",
      name: "Sub Total",
      cell: (row: LineItem) => (
        <div className="w-full">
          <Input
            type="number"
            name="subTotal"
            disabled
            placeholder={"Sub Total"}
            required={true}
            value={row.subTotal}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
          />
        </div>
      ),
    },
    {
      width: "130px",
      name: "Action",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Button type="button" onClick={() => RemoveLineItem(index)}>
            Remove
          </Button>
        </div>
      ),
    },
  ];

  const submitHandler = () => {
    // e.preventDefault();
    // const totals = calculateTotals();
    // const invoiceData = {
    //   // customerDetails,
    //   lineItems,
    //   ...totals,
    // };
    // navigate("/sales", { state: invoiceData });
  };

  return (
    <div className="w-full h-full p-6 rounded-2xl bg-white border shadow-xl">
      <h1 className="text-xl bg-munsell_blue text-white rounded-lg w-fit py-1 px-4">
        Create Invoice
      </h1>
      <form onSubmit={submitHandler} noValidate>
        {/* Customer Details */}
        <div className="mt-4 p-4 rounded-lg border">
          <h2 className="text-xl">Customer Details</h2>
          <div className="grid grid-cols-3 gap-4 mt-2">
            <LabeledInput
              name="customerName"
              title="Customer Name"
              type="text"
              placeholder="Enter Full Name"
              onChange={() => {
                console.log();
              }}
            />
            <LabeledInput
              // name="customerPhone"
              name="customerPhone"
              title="Phone No."
              type="tel"
              placeholder="Enter Phone No."
              onChange={() => {
                console.log();
              }}
            />
            <LabeledInput
              name="customerEmail"
              title="Email Id"
              type="email"
              placeholder="Enter Email Id"
              onChange={() => {
                console.log();
              }}
            />
          </div>
        </div>

        {/* Purchased Items Details */}
        <div className="mt-4 p-4 rounded-lg border">
          <h2 className="text-xl mb-2">Purchased Items Details</h2>
          <CustomDataTable columns={invoiceCols} data={lineItems} />
          <div className="flex w-full justify-end p-2">
            <Button onClick={AddLineItem}>Add Item</Button>
          </div>
          <div className="w-full flex justify-end">
            <div className="text-sm grid grid-cols-2 gap-y-3 gap-x-3 mt-6 items-center justify-items-end">
              <div>Total Tax:</div>
              <Input
                disabled={true}
                type="number"
                name="totalTax"
                value={totalTax}
                placeholder={"Total Tax"}
              />
              <div>Total Discount:</div>
              <Input
                disabled={true}
                type="number"
                name="totalDiscount"
                value={totalDiscount}
                placeholder={"Total Discount"}
              />{" "}
              <div>Total Amount:</div>
              <Input
                disabled={true}
                type="number"
                value={totalAmount}
                name="totalAmount"
                placeholder={"Total Amount"}
              />
            </div>
          </div>
          <div className="flex gap-4 items-center">
            <Button type="submit">Create</Button>
            <Button active={false} onClick={() => console.log()}>
              Reset
            </Button>
          </div>
        </div>

        {/* <DevTool control={control} /> */}
      </form>
    </div>
  );
}

export default InvoiceCreate;
