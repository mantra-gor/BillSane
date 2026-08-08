import { useEffect, type ReactNode } from "react";
import DataTable, { createTheme } from "react-data-table-component";

// react-data-table-component paints from its own theme registry, not Tailwind,
// so the design tokens have to be restated here as raw values. Keep these in
// sync with tailwind.config.js.
createTheme(
  "billsane",
  {
    text: {
      primary: "#0C2231",
      secondary: "#64798B",
      disabled: "#93A5B4",
    },
    background: { default: "#FFFFFF" },
    context: { background: "#053247", text: "#FFFFFF" },
    divider: { default: "#EEF3F8" },
    button: {
      default: "#64798B",
      focus: "#298E9E",
      hover: "#0C2231",
      disabled: "#CBD8E3",
    },
    highlightOnHover: { default: "#F8FAFC", text: "#0C2231" },
    striped: { default: "#FBFCFD", text: "#0C2231" },
    selected: { default: "#DEF5F7", text: "#0C2231" },
  },
  "light"
);

// Zebra striping plus row borders is one signal too many. The table reads as a
// clean list: hairline dividers, a quiet header, and hover as the only fill.
const customStyles = {
  table: {
    style: {
      backgroundColor: "transparent",
    },
  },
  responsiveWrapper: {
    style: {
      borderRadius: "0.75rem",
    },
  },
  head: {
    style: {
      fontFamily: "inherit",
    },
  },
  headRow: {
    style: {
      minHeight: "42px",
      backgroundColor: "#F8FAFC",
      borderBottomWidth: "1px",
      borderBottomColor: "#E3EAF1",
      borderBottomStyle: "solid" as const,
    },
  },
  headCells: {
    style: {
      fontSize: "11px",
      fontWeight: 700,
      letterSpacing: "0.06em",
      textTransform: "uppercase" as const,
      color: "#64798B",
      paddingLeft: "16px",
      paddingRight: "16px",
    },
  },
  rows: {
    style: {
      minHeight: "52px",
      fontSize: "14px",
      color: "#0C2231",
      borderBottomColor: "#EEF3F8 !important",
      transition: "background-color 120ms ease",
      "&:last-of-type": {
        borderBottomWidth: "0 !important",
      },
    },
    highlightOnHoverStyle: {
      backgroundColor: "#F8FAFC",
      borderBottomColor: "#EEF3F8 !important",
      outline: "none",
    },
  },
  cells: {
    style: {
      paddingLeft: "16px",
      paddingRight: "16px",
    },
  },
  pagination: {
    style: {
      backgroundColor: "#F8FAFC",
      borderTopWidth: "1px",
      borderTopColor: "#E3EAF1",
      borderTopStyle: "solid" as const,
      fontSize: "13px",
      color: "#64798B",
      minHeight: "48px",
    },
    pageButtonsStyle: {
      borderRadius: "0.5rem",
      height: "30px",
      width: "30px",
      cursor: "pointer",
      transition: "background-color 120ms ease",
      fill: "#64798B",
      "&:disabled": { fill: "#CBD8E3", cursor: "not-allowed" },
      "&:hover:not(:disabled)": { backgroundColor: "#EEF3F8" },
      "&:focus": { outline: "none", backgroundColor: "#DEF5F7" },
    },
  },
  noData: {
    style: {
      backgroundColor: "transparent",
    },
  },
  progress: {
    style: {
      backgroundColor: "transparent",
      color: "#64798B",
    },
  },
};

const denseStyles = {
  ...customStyles,
  headRow: {
    style: { ...customStyles.headRow.style, minHeight: "36px" },
  },
  rows: {
    ...customStyles.rows,
    style: { ...customStyles.rows.style, minHeight: "44px" },
  },
};

function CustomDataTable({
  columns,
  data,
  pagination = false,
  highlightOnHover = false,
  defaultSortFieldId,
  defaultSortAsc = true,
  noDataComponent,
  onRowClicked,
  dense = false,
  fixedHeader = false,
  fixedHeaderScrollHeight,
  /** Removes the outer border/rounding, for tables already inside a `Card`. */
  bare = false,
}: {
  columns: object[];
  data: object[];
  pagination?: boolean;
  highlightOnHover?: boolean;
  defaultSortFieldId?: string | number;
  defaultSortAsc?: boolean;
  noDataComponent?: ReactNode;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onRowClicked?: (row: any) => void;
  dense?: boolean;
  fixedHeader?: boolean;
  fixedHeaderScrollHeight?: string;
  bare?: boolean;
}) {
  // The library marks sortable headers focusable, which puts every column in
  // the tab order ahead of the actual controls on the page.
  useEffect(() => {
    const headers = document.querySelectorAll(
      '[role="columnheader"][tabindex="0"]'
    );
    headers.forEach((header) => {
      header.setAttribute("tabIndex", "-1");
    });
  }, [columns, data]);

  return (
    <div
      className={`overflow-hidden ${
        bare ? "" : "rounded-xl border border-line bg-surface shadow-xs"
      }`}>
      <DataTable
        columns={columns}
        data={data}
        theme="billsane"
        customStyles={dense ? denseStyles : customStyles}
        responsive
        pagination={pagination}
        paginationPerPage={10}
        paginationRowsPerPageOptions={[10, 25, 50, 100]}
        highlightOnHover={highlightOnHover}
        pointerOnHover={highlightOnHover}
        onRowClicked={onRowClicked}
        defaultSortFieldId={defaultSortFieldId}
        defaultSortAsc={defaultSortAsc}
        fixedHeader={fixedHeader}
        fixedHeaderScrollHeight={fixedHeaderScrollHeight}
        noDataComponent={noDataComponent}
      />
    </div>
  );
}

export default CustomDataTable;
