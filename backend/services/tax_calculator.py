class TaxCalculator:
    def __init__(self):
        # Bảng tỷ lệ phần trăm thuế tính trên doanh thu (Theo Luật Thuế GTGT 48/2024/QH15 và Luật Thuế TNCN 109/2025/QH15)
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
            "hoat_dong_khac": {"gtgt": 0.02, "tncn": 0.01},
            
            # Nhóm đặc thù (Điều 7 Khoản 3 Luật 109/2025): Thuế suất TNCN 5%
            "cho_thue_tai_san_dai_ly": {"gtgt": 0.05, "tncn": 0.05},
            "dich_vu_noi_dung_so": {"gtgt": 0.05, "tncn": 0.05}
        }
        
        self.category_names = {
            "ban_buon_ban_le": "Nhóm 1: Phân phối, cung cấp hàng hóa (Bán buôn, bán lẻ)",
            "ban_le_thuoc_my_pham": "Nhóm 1: Phân phối, cung cấp hàng hóa (Bán lẻ thuốc, mỹ phẩm)",
            "phan_phoi_cung_cap_hang_hoa": "Nhóm 1: Phân phối, cung cấp hàng hóa",
            "nha_hang_quan_an_cafe": "Nhóm 2: Dịch vụ, không bao thầu (Nhà hàng, quán ăn, cafe)",
            "dich_vu_lam_dep_spa": "Nhóm 2: Dịch vụ, không bao thầu (Làm đẹp, spa)",
            "dich_vu_sua_chua": "Nhóm 2: Dịch vụ, không bao thầu (Sửa chữa)",
            "dich_vu_tu_van": "Nhóm 2: Dịch vụ, không bao thầu (Tư vấn)",
            "xay_dung_khong_bao_thau": "Nhóm 2: Xây dựng không bao thầu nguyên vật liệu",
            "san_xuat_gia_cong": "Nhóm 3: Sản xuất, vận tải có gắn hàng hóa (Gia công)",
            "van_tai_hang_hoa_hanh_khach": "Nhóm 3: Sản xuất, vận tải có gắn hàng hóa (Vận tải)",
            "xay_dung_co_bao_thau": "Nhóm 3: Xây dựng có bao thầu nguyên vật liệu",
            "san_xuat_van_tai_dich_vu_co_hang_hoa": "Nhóm 3: Sản xuất, vận tải, dịch vụ có gắn hàng hóa",
            "khai_thac_khoang_san": "Nhóm 4: Hoạt động kinh doanh khác (Khai thác khoáng sản)",
            "san_xuat_ttdb": "Nhóm 4: Hoạt động kinh doanh khác (Sản xuất hàng chịu thuế TTĐB)",
            "hoat_dong_khac": "Hoạt động kinh doanh khác",
            "cho_thue_tai_san_dai_ly": "Nhóm đặc thù: Cho thuê tài sản, đại lý bảo hiểm, xổ số (TNCN 5%)",
            "dich_vu_noi_dung_so": "Nhóm đặc thù: Dịch vụ nội dung thông tin số, quảng cáo số (TNCN 5%)"
        }

    def calculate_tax(self, revenue: float, category: str, method: str = "doanh_thu", expenses: float = 0):
        """
        Tính thuế cho hộ kinh doanh dựa trên công thức cứng.
        Quy định mới (2026 - NĐ 141): Doanh thu <= 1 tỷ/năm được miễn thuế.
        Với doanh thu > 1 tỷ: 
        - Thuế GTGT tính trên TOÀN BỘ doanh thu.
        - Thuế TNCN tính theo một trong hai phương pháp (NĐ 68/2026):
          + Theo doanh thu: Tính trên phần doanh thu vượt 1 tỷ.
          + Theo thu nhập tính thuế: (Doanh thu - Chi phí) x thuế suất.
        """
        if revenue <= 1000000000:
            return {
                "is_taxable": False,
                "reason": "Doanh thu dưới 1 tỷ VNĐ/năm, được miễn thuế GTGT và TNCN theo quy định mới (NĐ 141/2026/NĐ-CP).",
                "tax_gtgt": 0,
                "tax_tncn": 0,
                "total_tax": 0
            }
            
        if not category or category not in self.tax_rates:
            category = "hoat_dong_khac"
            
        rate = self.tax_rates[category]
        cat_name = self.category_names.get(category, "Hoạt động kinh doanh khác")
        
        # Phần doanh thu tính thuế GTGT (luôn tính trên toàn bộ doanh thu)
        taxable_revenue_gtgt = revenue
        tax_gtgt = taxable_revenue_gtgt * rate["gtgt"]
        
        if method == "thu_nhap":
            # Tính theo Thu nhập tính thuế (Điều 4, NĐ 68/2026 và Khoản 2 Điều 7 Luật Thuế TNCN 109/2025/QH15)
            taxable_income = max(0, revenue - expenses)
            
            # Thuế suất TNCN áp dụng theo phương pháp thu nhập tính thuế (dựa theo doanh thu năm)
            if revenue <= 3000000000:
                tncn_rate_net = 0.15  # 15% cho doanh thu đến 3 tỷ
            elif revenue <= 50000000000:
                tncn_rate_net = 0.17  # 17% cho doanh thu trên 3 tỷ đến 50 tỷ
            else:
                tncn_rate_net = 0.20  # 20% cho doanh thu trên 50 tỷ
                
            tax_tncn = taxable_income * tncn_rate_net
            
            return {
                "is_taxable": True,
                "revenue": revenue,
                "taxable_revenue_gtgt": taxable_revenue_gtgt,
                "taxable_income": taxable_income,
                "category": cat_name,
                "tax_gtgt": tax_gtgt,
                "tax_tncn": tax_tncn,
                "total_tax": tax_gtgt + tax_tncn,
                "explanation": f"- Ngành nghề: {cat_name}\n- Phương pháp: Tính theo Thu nhập tính thuế\n- Doanh thu {revenue:,.0f} VNĐ, Chi phí hợp lý: {expenses:,.0f} VNĐ\n  • Thuế GTGT tính trên toàn bộ doanh thu (Tỷ lệ: {rate['gtgt']*100}%).\n  • Thuế TNCN tính trên Thu nhập tính thuế = Doanh thu - Chi phí = {taxable_income:,.0f} VNĐ (Tỷ lệ: {tncn_rate_net*100}% theo Khoản 2 Điều 7 Luật 109/2025/QH15)."
            }
        else:
            # Phương pháp tính theo doanh thu
            taxable_revenue_tncn = revenue - 1000000000
            tax_tncn = taxable_revenue_tncn * rate["tncn"]
            
            return {
                "is_taxable": True,
                "revenue": revenue,
                "taxable_revenue_gtgt": taxable_revenue_gtgt,
                "taxable_revenue_tncn": taxable_revenue_tncn,
                "category": cat_name,
                "tax_gtgt": tax_gtgt,
                "tax_tncn": tax_tncn,
                "total_tax": tax_gtgt + tax_tncn,
                "explanation": f"- Ngành nghề: {cat_name}\n- Phương pháp: Tính theo Doanh thu\n- Doanh thu {revenue:,.0f} VNĐ\n  • Thuế GTGT tính trên toàn bộ doanh thu (Tỷ lệ: {rate['gtgt']*100}%).\n  • Thuế TNCN tính trên phần vượt 1 tỷ (tức là {taxable_revenue_tncn:,.0f} VNĐ, Tỷ lệ: {rate['tncn']*100}%)."
            }
