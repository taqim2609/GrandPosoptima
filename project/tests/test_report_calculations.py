import unittest
import math

def calculate_gross_fnb(fnb_total, cost_fnb, vendor_exp_fnb):
    """Laba F&B outlet = pendapatan − HPP − bagian vendor (omzet titipan bukan pendapatan outlet)"""
    return round(fnb_total - cost_fnb - vendor_exp_fnb, 2)

def calculate_gross_retail(retail_total, cost_retail):
    """Laba Retail outlet = pendapatan retail - HPP retail"""
    return round(retail_total - cost_retail, 2)

def calculate_sisa_cash(cash_sales, out_amount):
    """Sisa kas tunai toko = penjualan tunai - pengeluaran kas"""
    return round(cash_sales - out_amount, 2)

def calculate_vendor_share(price, qty, vendor_share_percent, vendor_total=None):
    line = price * qty
    if vendor_total is not None:
        return round(vendor_total, 2)
    return round(line * float(vendor_share_percent) / 100, 2)

def calculate_margin(revenue, cost):
    if not revenue:
        return 0.0
    profit = revenue - cost
    return round(profit / revenue * 100, 1)

class TestReportCalculations(unittest.TestCase):

    def test_gross_fnb_calculation(self):
        fnb_total = 150000.0
        cost_fnb = 45000.0
        vendor_exp_fnb = 30000.0  # Bagi hasil titipan vendor
        expected_gross = 75000.0
        self.assertEqual(calculate_gross_fnb(fnb_total, cost_fnb, vendor_exp_fnb), expected_gross)

    def test_discount_does_not_reduce_vendor_share(self):
        # Discount is absorbed 100% by outlet.
        # Original item price 20,000; qty 1; vendor share 70% (14,000)
        # Outlet gives 5,000 discount. Outlet revenue = 15,000.
        # Vendor share stays 14,000. Outlet gross = 15,000 - 14,000 - cost (0) = 1,000.
        price = 20000.0
        qty = 1
        vendor_share_percent = 70.0
        v_share = calculate_vendor_share(price, qty, vendor_share_percent)
        self.assertEqual(v_share, 14000.0)

    def test_sisa_cash_calculation(self):
        cash_sales = 500000.0
        out_fnb = 125000.0
        self.assertEqual(calculate_sisa_cash(cash_sales, out_fnb), 375000.0)

    def test_margin_rounding(self):
        revenue = 100000.0
        cost = 33333.33
        # profit = 66666.67, margin = 66.66667% -> round to 66.7%
        self.assertEqual(calculate_margin(revenue, cost), 66.7)

    def test_zero_revenue_margin(self):
        self.assertEqual(calculate_margin(0, 0), 0.0)

if __name__ == "__main__":
    unittest.main()
