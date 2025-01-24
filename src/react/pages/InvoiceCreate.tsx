import { useEffect, useState } from "react";
import CustomDataTable from "../components/ui/elements/CustomDataTable";
import Input from "../components/ui/elements/Input";
import LabeledInput from "../components/ui/elements/LabeledInput";
import Button from "../components/ui/elements/Button";
import upiIcon from "../assets/resources/upi-icon.png";
import cardIcon from "../assets/resources/card-icon.png";
import cashIcon from "../assets/resources/cash-icon.png";
import { useNavigate } from "react-router";
// import { useForm } from "react-hook-form";
// import { DevTool } from "@hookform/devtools";

type CustomerDetails = {
  name: string;
  phone: string;
  email?: string;
};

function InvoiceCreate() {
  const lineItem: LineItem = {
    id: Date.now(),
  };
  const navigate = useNavigate();
  const [selectedPayment, setSelectedPayment] = useState("cash");

  const paymentOptions = [
    { id: "cash", label: "Cash", icon: cashIcon },
    { id: "card", label: "Card", icon: cardIcon },
    { id: "upi", label: "UPI", icon: upiIcon },
  ];

  const handleSelect = (id: string) => {
    setSelectedPayment(id);
  };

  const [customerDetails, setCustomerDetails] = useState<CustomerDetails>();
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

  const calcTotals = (discount?: number) => {
    const totalTax = lineItems.reduce((sum, item) => sum + item.tax, 0);
    const totalAmount =
      lineItems.reduce((sum, item) => sum + item.subTotal, 0) -
      (discount ? discount : 0);
    setTotalAmount(totalAmount);
    setTotalTax(totalTax);
  };

  const discountHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    const discount = parseFloat(e.target.value);
    setTotalDiscount(discount);
    calcTotals(discount);
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

  const calcTax = (
    index: number,
    qty: number,
    rate: number,
    taxPer: number
  ) => {
    // Calculate the tax
    const tax = (rate * qty * taxPer) / 100;
    // Update the line item with the calculated tax
    handleLineItemChange(index, "tax", tax);
    // calculate sub total
    calcSubTotal(index, rate, qty, tax);
  };

  const calcSubTotal = (
    index: number,
    rate: number,
    qty: number,
    tax: number
  ) => {
    // Calculate the subtotal
    const rateWithTax = rate * qty + tax;

    const subTotal = rateWithTax;
    // Update the line item with the calculated subtotal
    handleLineItemChange(index, "subTotal", subTotal);
  };

  const invoiceCols = [
    {
      minwidth: "350px",
      name: "Item Name",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="text"
            name="itemName"
            placeholder={"Enter Product Name Here"}
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
            min={0}
            placeholder={"Item Rate"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "rate", value); // Pass as number
              calcTax(index, value, row.qty, row.taxPer); // Pass as number
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "-" || e.key === "e" || e.key === "+") {
                e.preventDefault();
              }
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            required={true}
          />
        </div>
      ),
    },
    {
      width: "130px",
      name: "Qty",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="number"
            name="qty"
            min={0}
            placeholder={"Quantity"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "qty", value); // Pass as number
              calcTax(index, row.rate, value, row.taxPer); // Pass as number
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "-" || e.key === "e" || e.key === "+") {
                e.preventDefault();
              }
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            required={true}
          />
        </div>
      ),
    },
    {
      width: "120px",
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
      width: "100px",
      name: "Tax (%)",
      cell: (row: LineItem, index: number) => (
        <div className="w-full">
          <Input
            type="number"
            name="taxPer"
            min={0}
            max={100}
            placeholder={"Tax per item (%)"}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const value = parseFloat(e.target.value); // Convert string to float
              handleLineItemChange(index, "taxPer", value); // Pass as number
              calcTax(index, row.qty, row.rate, value); // Pass as number
            }}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "-" || e.key === "e" || e.key === "+") {
                e.preventDefault();
              }
            }}
            onWheel={(e) => (e.target as HTMLInputElement).blur()}
            required={true}
          />
        </div>
      ),
    },
    {
      width: "100px",
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

  const submitHandler = (e) => {
    e.preventDefault();
    const billData = {
      date: new Date()
        .toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
        .replace(",", ""),
      customerDetails,
      lineItems,
      totalAmount,
      totalTax,
      totalDiscount,
      payment_type: selectedPayment,
      invoiceNo: "250700001",
    };

    console.log(billData);

    navigate("/invoice/view", { state: billData });
  };

  return (
    <div className="w-full h-full ] overflow-scroll p-6 rounded-2xl bg-white border shadow-xl">
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
              onChange={(e) => {
                setCustomerDetails((prev) => ({
                  ...prev,
                  name: e.target.value,
                  phone: prev?.phone || "",
                  email: prev?.email || "",
                }));
              }}
            />
            <LabeledInput
              name="customerPhone"
              title="Phone No."
              type="tel"
              placeholder="Enter Phone No."
              onChange={(e) => {
                setCustomerDetails((prev) => ({
                  ...prev,
                  phone: e.target.value,
                  name: prev?.name || "",
                  email: prev?.email || "",
                }));
              }}
            />
            <LabeledInput
              name="customerEmail"
              title="Email Id"
              type="email"
              placeholder="Enter Email Id"
              onChange={(e) => {
                setCustomerDetails((prev) => ({
                  ...prev,
                  email: e.target.value,
                  phone: prev?.phone || "",
                  name: prev?.name || "",
                }));
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
              <div>Discount:</div>
              <Input
                type="number"
                name="totalDiscount"
                value={totalDiscount}
                onChange={discountHandler}
                placeholder={"Discount (optional)"}
              />
              <div>Total Tax:</div>
              <Input
                disabled={true}
                type="number"
                name="totalTax"
                value={totalTax}
                placeholder={"Total Tax"}
              />
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
          <div className="flex flex-col w-full mx-auto mt-4 mb-8">
            <h2 className="text-base font-medium mb-2">Select Payment Type</h2>
            <div className="grid grid-cols-3 gap-4">
              {paymentOptions.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`flex items-center gap-2 p-1 rounded-lg shadow-md transition-all duration-200 cursor-pointer border-2 
              ${
                selectedPayment === option.id
                  ? "border-prussian_blue bg-prussian_blue-5"
                  : "border-gray-200 bg-gray-50"
              }
            `}>
                  <span className="text-3xl">
                    <img src={option.icon} className="w-12 p-1" />
                  </span>
                  <span className="text-base font-medium">{option.label}</span>
                </button>
              ))}
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
