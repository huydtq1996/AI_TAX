class TaxCalculator:
    def __init__(self):
        # Bảng tỷ lệ phần trăm thuế tính trên doanh thu (Theo TT 40/2021)
        self.tax_rates = {
            "phan_phoi_cung_cap_hang_hoa": {"gtgt": 0.01, "tncn": 0.005},
            "dich_vu_xay_dung_khong_bao_thau": {"gtgt": 0.05, "tncn": 0.02},
            "san_xuat_van_tai_dich_vu_co_hang_hoa": {"gtgt": 0.03, "tncn": 0.015},
            "hoat_dong_khac": {"gtgt": 0.02, "tncn": 0.01}
        }

    def calculate_tax(self, revenue: float, category: str):
        """
        Tính thuế cho hộ kinh doanh dựa trên công thức cứng.
        Quy định: Doanh thu <= 100 triệu/năm được miễn thuế.
        """
        if revenue <= 100000000:
            return {
                "is_taxable": False,
                "reason": "Doanh thu dưới 100 triệu VNĐ/năm, được miễn thuế theo quy định.",
                "tax_gtgt": 0,
                "tax_tncn": 0,
                "total_tax": 0
            }
            
        rate = self.tax_rates.get(category, self.tax_rates["hoat_dong_khac"])
        tax_gtgt = revenue * rate["gtgt"]
        tax_tncn = revenue * rate["tncn"]
        
        return {
            "is_taxable": True,
            "revenue": revenue,
            "category": category,
            "tax_gtgt": tax_gtgt,
            "tax_tncn": tax_tncn,
            "total_tax": tax_gtgt + tax_tncn,
            "explanation": f"Ngành nghề: {category}. Tỷ lệ GTGT: {rate['gtgt']*100}%, Tỷ lệ TNCN: {rate['tncn']*100}%."
        }
