class TaxCalculator:
    def __init__(self):
        # Bảng tỷ lệ phần trăm thuế tính trên doanh thu (Theo TT 40/2021)
        self.tax_rates = {
            # Nhóm 1: Phân phối, cung cấp hàng hóa (GTGT 1%, TNCN 0.5%)
            "ban_buon_ban_le": {"gtgt": 0.01, "tncn": 0.005},
            "ban_le_thuoc_my_pham": {"gtgt": 0.01, "tncn": 0.005},
            "phan_phoi_cung_cap_hang_hoa": {"gtgt": 0.01, "tncn": 0.005},
            
            # Nhóm 2: Dịch vụ, xây dựng không bao thầu (GTGT 5%, TNCN 2%)
            "nha_hang_quan_an_cafe": {"gtgt": 0.05, "tncn": 0.02},
            "dich_vu_lam_dep_spa": {"gtgt": 0.05, "tncn": 0.02},
            "dich_vu_sua_chua": {"gtgt": 0.05, "tncn": 0.02},
            "dich_vu_tu_van": {"gtgt": 0.05, "tncn": 0.02},
            "xay_dung_khong_bao_thau": {"gtgt": 0.05, "tncn": 0.02},
            
            # Nhóm 3: Sản xuất, vận tải, dịch vụ có gắn hàng hóa (GTGT 3%, TNCN 1.5%)
            "san_xuat_gia_cong": {"gtgt": 0.03, "tncn": 0.015},
            "van_tai_hang_hoa_hanh_khach": {"gtgt": 0.03, "tncn": 0.015},
            "xay_dung_co_bao_thau": {"gtgt": 0.03, "tncn": 0.015},
            "san_xuat_van_tai_dich_vu_co_hang_hoa": {"gtgt": 0.03, "tncn": 0.015},
            
            # Nhóm 4: Hoạt động kinh doanh khác (GTGT 2%, TNCN 1%)
            "khai_thac_khoang_san": {"gtgt": 0.02, "tncn": 0.01},
            "san_xuat_ttdb": {"gtgt": 0.02, "tncn": 0.01},
            "hoat_dong_khac": {"gtgt": 0.02, "tncn": 0.01}
        }

    def calculate_tax(self, revenue: float, category: str):
        """
        Tính thuế cho hộ kinh doanh dựa trên công thức cứng.
        Quy định mới (2026): Doanh thu <= 500 triệu/năm được miễn thuế.
        Thuế chỉ tính trên phần doanh thu VƯỢT 500 triệu.
        """
        if revenue <= 500000000:
            return {
                "is_taxable": False,
                "reason": "Doanh thu dưới 500 triệu VNĐ/năm, được miễn thuế GTGT và TNCN theo quy định mới.",
                "tax_gtgt": 0,
                "tax_tncn": 0,
                "total_tax": 0
            }
            
        rate = self.tax_rates.get(category, self.tax_rates["hoat_dong_khac"])
        
        # Phần doanh thu tính thuế
        taxable_revenue = revenue - 500000000
        
        tax_gtgt = taxable_revenue * rate["gtgt"]
        tax_tncn = taxable_revenue * rate["tncn"]
        
        return {
            "is_taxable": True,
            "revenue": revenue,
            "taxable_revenue": taxable_revenue,
            "category": category,
            "tax_gtgt": tax_gtgt,
            "tax_tncn": tax_tncn,
            "total_tax": tax_gtgt + tax_tncn,
            "explanation": f"Ngành nghề: {category}. Theo quy định 2026, chỉ tính thuế phần doanh vượt 500 triệu (tức là {taxable_revenue:,.0f} VNĐ). Tỷ lệ GTGT: {rate['gtgt']*100}%, Tỷ lệ TNCN: {rate['tncn']*100}%."
        }
