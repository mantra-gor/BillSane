import DataTable, { createTheme } from "react-data-table-component";

// createTheme("solarized", {
//   text: {
//     primary: "text-prussian_blue",
//   },
//   background: {
//     default: "#ffffff",
//   },
//   context: {
//     background: "#1b1b1b",
//     text: "#FFFFFF",
//   },
//   divider: {
//     default: "#fff",
//   },
//   action: {
//     button: "rgba(0,0,0,.54)",
//     hover: "rgba(0,0,0)",
//     disabled: "rgba(0,0,0,.12)",
//   },
// });

const customStyles = {
  headCells: {
    style: {
      fontSize: "14px",
      backgroundColor: "#298E9E",
      color: "#fff",
    },
  },
  rows: {
    style: {
      backgroundColor: "#fff",
      "&:nth-of-type(odd)": {
        // Style for odd rows
        backgroundColor: "#EBEBEB",
      },
    },
  },
};

function CustomDataTable({ columns, data }) {
  return (
    <div className="rounded-lg overflow-clip shadow-md">
      <DataTable
        columns={columns}
        data={data}
        theme="solarized"
        className="pb-2 bg-[#EBEBEB]"
        responsive
        customStyles={customStyles}
      />
    </div>
  );
}

export default CustomDataTable;
