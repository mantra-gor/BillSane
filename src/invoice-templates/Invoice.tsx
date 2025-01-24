import { useState } from "react";
import brand_logo from "../react/assets/branding/logo-no-background.png";
import { useLocation } from "react-router";
import { useReactToPrint } from "react-to-print";
import { useRef } from "react";
import { PiPrinterBold } from "react-icons/pi";

function Invoice() {
  const contentRef = useRef<HTMLDivElement>(null);
  const reactToPrintFn = useReactToPrint({ contentRef });

  const businessDetails = {
    gst: "06AAACM5586C1ZL",
    phone: "+91 9999977777",
    email: "contactus@billsane.com",
    address:
      "Manyata Embassy Business Park Block N1 Ground Floor Rachenahalli, Nagavara Bangalore, Karnataka 560045, IN",
  };

  // const [billData2, setBillData2] = useState({
  //   date: new Date()
  //     .toLocaleDateString("en-GB", {
  //       day: "2-digit",
  //       month: "short",
  //       year: "numeric",
  //     })
  //     .replace(",", ""),
  //   invoiceNo: "250700001",
  //   customerDetails: {
  //     name: "Mantra Gor",
  //     phone: "+91 7778888999",
  //     email: "mantragor77@gmail.com",
  //   },
  //   payment_type: "Cash",
  //   totalAmount: 1176450,
  //   lineItems: [
  //     {
  //       itemName: "DocuLens AI",
  //       rate: "500000",
  //       qty: "2",
  //       taxType: "GST",
  //       taxPer: "18",
  //       tax: "84600",
  //       subTotal: "554600",
  //     },
  //     {
  //       itemName: "SmartOffice Pro",
  //       rate: "120000",
  //       qty: "1",
  //       taxType: "GST",
  //       taxPer: "18",
  //       tax: "21600",
  //       subTotal: "108600",
  //     },
  //     {
  //       itemName: "EcoPrinter 3000",
  //       rate: "80000",
  //       qty: "1",
  //       taxType: "GST",
  //       taxPer: "18",
  //       tax: "14400",
  //       subTotal: "96000",
  //     },
  //     {
  //       itemName: "QuantumPad 12",
  //       rate: "50000",
  //       qty: "3",
  //       taxType: "GST",
  //       taxPer: "18",
  //       tax: "15750",
  //       subTotal: "142250",
  //     },
  //     {
  //       itemName: "SmartTable 200",
  //       rate: "50000",
  //       qty: "5",
  //       taxType: "GST",
  //       taxPer: "18",
  //       tax: "45000",
  //       subTotal: "275000",
  //     },
  //   ],
  // });

  const location = useLocation();
  const billData = location.state;

  return (
    <div
      ref={contentRef}
      className="mx-auto bg-white rounded-lg shadow-lgp overflow-hidden">
      <div className="w-full p-2 flex justify-end hideContent">
        <button
          className="p-2 bg-slate-200 rounded-lg hover:bg-slate-300 duration-200"
          onClick={() => reactToPrintFn()}>
          <PiPrinterBold size={21} />
        </button>
      </div>
      <div className="px-12 py-8 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <img src={brand_logo} className="h-14" alt="Brand Logo" />
          <div className="text-right">
            <p className="text-sm text-gray-500">Date</p>
            <p className="text-lg font-semibold text-gray-800">
              {billData.date}
            </p>
            <p className="text-sm text-gray-500">Invoice #</p>
            <p className="text-lg font-semibold text-gray-800">
              {billData.invoiceNo}
            </p>
          </div>
        </div>
      </div>
      <div className="px-12 py-8 bg-gray-50">
        <div className="flex justify-between space-x-12">
          <div className="text-sm text-gray-600">
            <p className="font-bold text-gray-800">BillSane Inc.</p>
            <p>Phone: {businessDetails.phone}</p>
            <p>Email: {businessDetails.email}</p>
            <p>GST: {businessDetails.gst}</p>
            <address className="mt-2 text-gray-600 max-w-[300px]">
              {businessDetails.address}
            </address>
          </div>
          <div className="text-sm text-gray-600 text-right">
            <p className="font-bold text-gray-800">
              {billData.customerDetails.name}
            </p>
            <p>Phone: {billData.customerDetails.phone}</p>
            <p>Email: {billData.customerDetails.email}</p>
          </div>
        </div>
      </div>
      <div className="px-12 py-8 overflow-x-auto">
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-200">
              <th className="py-2 px-4 text-left text-sm text-gray-600">Sr.</th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">
                Item Name
              </th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">
                Rate
              </th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">Qty</th>
              {/* <th className="py-2 px-4 text-left text-sm text-gray-600">
                Discount (%)
              </th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">
                Discount
              </th> */}
              {/* <th className="py-2 px-4 text-left text-sm text-gray-600">
                Tax Type
              </th> */}
              <th className="py-2 px-4 text-left text-sm text-gray-600">
                Tax Rate
                {/* (%) */}
              </th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">Tax</th>
              <th className="py-2 px-4 text-left text-sm text-gray-600">
                SubTotal
              </th>
            </tr>
          </thead>
          <tbody>
            {billData.lineItems.map((item, index) => (
              <tr key={index} className="border-b hover:bg-gray-50">
                <td className="py-2 px-4 text-sm">{index + 1}</td>
                <td className="py-2 px-4 text-sm">{item.itemName}</td>
                <td className="py-2 px-4 text-sm">
                  ₹{item.rate.toLocaleString("en-IN")}
                </td>
                <td className="py-2 px-4 text-sm">{item.qty}</td>
                {/* <td className="py-2 px-4 text-sm">{item.discountPer}</td> */}
                {/* <td className="py-2 px-4 text-sm">{item.discount}</td> */}
                {/* <td className="py-2 px-4 text-sm">{item.taxType}</td> */}
                <td className="py-2 px-4 text-sm">
                  {item.taxPer}% {item.taxType}
                </td>
                <td className="py-2 px-4 text-sm">
                  {item.tax.toLocaleString("en-IN")}
                </td>
                <td className="py-2 px-4 text-sm">
                  {item.subTotal.toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-12 py-4 text-right text-lg font-semibold text-gray-800">
        {/* Total: ₹{billData.total} */}
        Total: ₹{billData.totalAmount.toLocaleString("en-IN")}
      </div>
      {billData.totalDiscount && (
        <div className="px-12 py-1 text-right text-lg font-semibold text-gray-800">
          {/* Total: ₹{billData.total} */}
          Discount: ₹{billData.totalDiscount?.toLocaleString("en-IN")}
        </div>
      )}
      <div className="px-12 py-6 bg-gray-50">
        <p className="text-main font-bold text-gray-800">Payment Details</p>
        <p className="capitalize">Payment Type: {billData.payment_type}</p>
      </div>
      <div className="px-12 py-6">
        <p className="text-main font-bold text-gray-800">Notes</p>
        <p className="italic text-gray-600">
          Lorem ipsum is placeholder text commonly used in the graphic, print,
          and publishing industries for previewing layouts and visual mockups.
        </p>
      </div>
      {/* <footer className="py-4 bg-gray-800 text-gray-200 text-center text-sm">
        BillSane | Made By ❤️ In India | contactus@billsane.com | Mantra Gor
      </footer> */}
      <footer className="py-4 rounded-b-lg bg-gray-800 text-gray-200 text-center text-sm absolute left-0 right-0 bottom-0">
        © {new Date().getFullYear()} BillSane • Crafted with ❤️ in India{" "}
        {/* • */}
        {/* <a
          href="mailto:contactus@billsane.com"
          className="text-blue-400 hover:underline">
          contactus@billsane.com
        </a>{" "} */}
        • Powered by Mantra Gor
      </footer>
    </div>
  );
}

export default Invoice;
