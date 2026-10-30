import React from "react";
// @ts-expect-error react-dom types not installed in React Native/Expo project
import { renderToStaticMarkup } from "react-dom/server";
import { Badge, statusTone } from "../components/Badge";
import { Button } from "../components/Button";
import { ChoiceGroup } from "../components/ChoiceGroup";
import { Input } from "../components/Input";
import { EmptyState, ErrorState, LoadingState } from "../components/States";
import {
  SidebarDrawer,
  SIDEBAR_NAV_ITEMS,
  KASIR_NAV_ITEMS,
} from "../components/SidebarDrawer";
import {
  normalizeRoute,
  isRouteActive,
  resolveTabRouteName,
  evaluateNavigationGuard,
} from "../lib/navigation-logic";
import { ScreenHeader } from "../components/ScreenHeader";
import { FloatingTabBar } from "../components/FloatingNavbar";
import {
  getDeviceType,
  getOrientation,
  getGridColumns,
  getModalLayout,
  getNextOrientationMode,
  applyOrientationLock,
} from "../lib/orientation-logic";

describe("Shared UI & Responsive Architecture (UI Components, Sidebar & Tablet Layout)", () => {
  // ============================================================================
  // BAGIAN 1: KOMPONEN UI MODULAR
  // ============================================================================
  describe("1. Komponen UI Modular (Badge, Button, ChoiceGroup, Input, States)", () => {
    describe("Badge Component", () => {
      it("memetakan tone class untuk success, danger, warning, dan neutral", () => {
        expect(statusTone("Aktif")).toBe("success");
        expect(statusTone("Nonaktif")).toBe("danger");
        expect(statusTone("Lainnya")).toBe("danger");

        const successBadge = Badge({ label: "Tersedia", tone: "success" });
        expect(successBadge.props.className).toContain("bg-success-soft");

        const dangerBadge = Badge({ label: "Habis", tone: "danger" });
        expect(dangerBadge.props.className).toContain("bg-danger-soft");

        const warningBadge = Badge({ label: "Low Stock", tone: "warning" });
        expect(warningBadge.props.className).toContain("bg-warning-soft");
      });

      it("merender teks label badge dengan benar", () => {
        const badge = Badge({ label: "Admin", tone: "accent" });
        const textChild = badge.props.children[1];
        expect(textChild.props.children).toBe("Admin");
        expect(textChild.props.className).toContain("text-primary");
      });
    });

    describe("Button Component", () => {
      it("menerapkan varian dan ukuran tombol dengan tepat", () => {
        const primaryBtn = Button({
          title: "Simpan",
          variant: "primary",
          size: "md",
        });
        expect(primaryBtn.props.className).toContain("bg-primary");
        expect(primaryBtn.props.className).toContain("min-h-12");

        const outlineBtn = Button({
          title: "Batal",
          variant: "outline",
          size: "sm",
        });
        expect(outlineBtn.props.className).toContain("border-primary");
        expect(outlineBtn.props.className).toContain("min-h-10");

        const dangerBtn = Button({
          title: "Hapus",
          variant: "danger",
          size: "lg",
        });
        expect(dangerBtn.props.className).toContain("bg-danger");
        expect(dangerBtn.props.className).toContain("min-h-14");
      });

      it("menangani status disabled dan loading state", () => {
        const disabledBtn = Button({ title: "Kirim", disabled: true });
        expect(disabledBtn.props.disabled).toBe(true);
        expect(disabledBtn.props.className).toContain("opacity-50");

        const loadingBtn = Button({ title: "Memproses...", isLoading: true });
        expect(loadingBtn.props.disabled).toBe(true);
        const spinner = loadingBtn.props.children[0];
        expect(spinner).not.toBeNull();
      });
    });

    describe("ChoiceGroup Component", () => {
      it("merender pilihan opsi dan menandai opsi yang aktif", () => {
        const options = [
          { label: "Admin", value: "admin" },
          { label: "Kasir", value: "kasir" },
        ];
        const onChange = jest.fn();
        const choiceGroup = ChoiceGroup({
          label: "Pilih Role",
          options,
          value: "kasir",
          onChange,
        });

        const buttonsContainer = choiceGroup.props.children[1];
        const renderedOptions = buttonsContainer.props.children;
        expect(renderedOptions).toHaveLength(2);
        expect(renderedOptions[1].props.accessibilityState.selected).toBe(true);

        renderedOptions[0].props.onPress();
        expect(onChange).toHaveBeenCalledWith("admin");
      });
    });

    describe("Input Component", () => {
      it("merender label, pesan error, dan hint text", () => {
        const normalHtml = renderToStaticMarkup(
          <Input label="Email Pengguna" placeholder="user@example.com" />,
        );
        expect(normalHtml).toContain("Email Pengguna");

        const errorHtml = renderToStaticMarkup(
          <Input label="Password" error="Minimal 6 karakter" />,
        );
        expect(errorHtml).toContain("Minimal 6 karakter");
        expect(errorHtml).toContain("border-primary");

        const hintHtml = renderToStaticMarkup(
          <Input label="Nama" hint="Sesuai KTP" />,
        );
        expect(hintHtml).toContain("Sesuai KTP");
      });
    });

    describe("States Components (LoadingState, EmptyState, ErrorState)", () => {
      it("merender LoadingState dengan label yang sesuai", () => {
        const loading = LoadingState({ label: "Menyinkronkan stok..." });
        expect(loading.props.children[1].props.children).toBe(
          "Menyinkronkan stok...",
        );
      });

      it("merender EmptyState dengan tombol aksi", () => {
        const onAction = jest.fn();
        const empty = EmptyState({
          title: "Produk Kosong",
          description: "Belum ada produk.",
          actionLabel: "Tambah Produk",
          onAction,
        });
        const actionBtn = empty.props.children[3];
        actionBtn.props.onPress();
        expect(onAction).toHaveBeenCalledTimes(1);
      });

      it("merender ErrorState dengan tombol retry", () => {
        const onRetry = jest.fn();
        const error = ErrorState({
          message: "Koneksi terputus",
          onRetry,
        });
        const retryBtn = error.props.children[3];
        retryBtn.props.onPress();
        expect(onRetry).toHaveBeenCalledTimes(1);
      });
    });
  });

  // ============================================================================
  // BAGIAN 2: RESPONSIFITAS & ROTASI LAYAR (TABLET & SMARTPHONE)
  // ============================================================================
  describe("2. Responsifitas & Rotasi Layar (orientation-logic)", () => {
    describe("Deteksi Perangkat (getDeviceType)", () => {
      it("mendeteksi layar smartphone (iPhone, Galaxy, Pixel)", () => {
        expect(getDeviceType(390, 844)).toBe("phone");
        expect(getDeviceType(412, 915)).toBe("phone");
      });

      it("mendeteksi layar tablet portrait dan landscape", () => {
        expect(getDeviceType(768, 1024)).toBe("tablet");
        expect(getDeviceType(1024, 768)).toBe("tablet");
        expect(getDeviceType(1280, 800)).toBe("tablet");
      });
    });

    describe("Deteksi Orientasi Layar (getOrientation)", () => {
      it("mendeteksi orientasi portrait dan landscape", () => {
        expect(getOrientation(390, 844)).toBe("portrait");
        expect(getOrientation(844, 390)).toBe("landscape");
      });
    });

    describe("Jumlah Kolom Grid Responsif (getGridColumns)", () => {
      it("menentukan kolom 1 untuk phone portrait, 2 untuk tablet portrait/phone landscape, dan 3 untuk tablet landscape", () => {
        expect(getGridColumns(390)).toBe(1);
        expect(getGridColumns(768)).toBe(2);
        expect(getGridColumns(1024)).toBe(3);
        expect(getGridColumns(1280)).toBe(3);
      });
    });

    describe("Tata Letak Dialog Modal (getModalLayout)", () => {
      it("menggunakan bottom-sheet pada ponsel dan centered dialog pada tablet", () => {
        const phoneLayout = getModalLayout(390, "phone");
        expect(phoneLayout.isCentered).toBe(false);
        expect(phoneLayout.containerClass).toContain("justify-end");

        const tabletLayout = getModalLayout(1024, "tablet");
        expect(tabletLayout.isCentered).toBe(true);
        expect(tabletLayout.containerClass).toContain("justify-center");
        expect(tabletLayout.maxWidth).toBe(600);
      });
    });

    describe("Siklus Mode Rotasi (getNextOrientationMode & applyOrientationLock)", () => {
      it("melakukan siklus auto -> landscape -> portrait -> auto", () => {
        expect(getNextOrientationMode("auto")).toBe("landscape");
        expect(getNextOrientationMode("landscape")).toBe("portrait");
        expect(getNextOrientationMode("portrait")).toBe("auto");
      });

      it("menangani penguncian orientasi secara aman tanpa throw error", async () => {
        await expect(applyOrientationLock("auto")).resolves.not.toThrow();
        await expect(applyOrientationLock("landscape")).resolves.not.toThrow();
        await expect(applyOrientationLock("portrait")).resolves.not.toThrow();
      });
    });
  });

  // ============================================================================
  // BAGIAN 3: NAVIGASI SIDEBAR DRAWER (ADMIN & KASIR)
  // ============================================================================
  describe("3. Navigasi Sidebar Drawer & Screen Header", () => {
    const mockUser = {
      id: "user-123",
      email: "admin@fantasicoffee.com",
      role: "Admin" as const,
      status: "Aktif" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      employee_id: null,
    };

    it("memisahkan navigasi sidebar ke grup Menu Utama dan Pengelolaan Operasional", () => {
      expect(SIDEBAR_NAV_ITEMS.main).toBeDefined();
      expect(SIDEBAR_NAV_ITEMS.management).toBeDefined();

      const mainRoutes = SIDEBAR_NAV_ITEMS.main.map((i) => i.route);
      expect(mainRoutes).toContain("/(admin)/dashboard");
      expect(mainRoutes).toContain("/(admin)/product");
      expect(mainRoutes).toContain("/(admin)/inventory");

      const mgmtRoutes = SIDEBAR_NAV_ITEMS.management.map((i) => i.route);
      expect(mgmtRoutes).toContain("/(admin)/category");
      expect(mgmtRoutes).toContain("/(admin)/employee");
      expect(mgmtRoutes).toContain("/(admin)/user");
    });

    it("mendefinisikan navigasi sidebar khusus kasir tanpa konflik navbar", () => {
      expect(KASIR_NAV_ITEMS.main).toBeDefined();
      const kasirRoutes = KASIR_NAV_ITEMS.main.map((i) => i.route);
      expect(kasirRoutes).toContain("/(kasir)/pos");
      expect(kasirRoutes).toContain("/(kasir)/inventory");
    });

    it("merender brand title dan info user di drawer header", () => {
      const html = renderToStaticMarkup(
        <SidebarDrawer
          isOpen={true}
          onClose={jest.fn()}
          user={mockUser}
          onLogout={jest.fn()}
          onNavigate={jest.fn()}
        />,
      );
      expect(html).toContain("Fantasi Coffee");
      expect(html).toContain("admin@fantasicoffee.com");
      expect(html).toContain("Keluar");
    });

    it("merender ScreenHeader sejajar dengan tombol hamburger sidebar", () => {
      const html = renderToStaticMarkup(
        <ScreenHeader
          title="Katalog Produk"
          subtitle="Kelola Menu"
          onOpenSidebar={jest.fn()}
        />,
      );
      expect(html).toContain("Katalog Produk");
      expect(html).toContain("Kelola Menu");
      expect(html).toContain("menu-outline");
    });

    it("memvalidasi logika normalisasi dan pencocokan rute aktif (navigation-logic)", () => {
      // 1. Normalisasi nama rute dengan group stripping
      expect(normalizeRoute("/(admin)/dashboard")).toBe("/dashboard");
      expect(normalizeRoute("/(kasir)/pos")).toBe("/pos");
      expect(normalizeRoute("/dashboard/")).toBe("/dashboard");
      expect(normalizeRoute("/(customer)/product?sort=asc")).toBe("/product");

      // 2. Pencocokan rute aktif Admin & Kasir
      expect(isRouteActive("/dashboard", "/(admin)/dashboard")).toBe(true);
      expect(isRouteActive("/(admin)/dashboard", "/(admin)/dashboard")).toBe(true);
      expect(isRouteActive("/product", "/(admin)/product")).toBe(true);
      expect(isRouteActive("/pos", "/(kasir)/pos")).toBe(true);
      expect(isRouteActive("/orders", "/(kasir)/orders")).toBe(true);

      // 3. Menolak rute yang tidak cocok (bukan false positive)
      expect(isRouteActive("/category", "/(admin)/product")).toBe(false);
      expect(isRouteActive("/product-promo", "/(admin)/product")).toBe(false);

      // 4. Mendukung sub-halaman hierarkis
      expect(isRouteActive("/product/edit/10", "/(admin)/product")).toBe(true);

      // 5. Ekstraksi nama tab
      expect(resolveTabRouteName("/(admin)/dashboard")).toBe("dashboard");
      expect(resolveTabRouteName("/(kasir)/pos")).toBe("pos");
      expect(resolveTabRouteName("/(admin)/category")).toBe("category");
    });

    it("mengevaluasi aturan guard segmen rute dan RBAC secara tepat (evaluateNavigationGuard)", () => {
      // 1. Belum siap (loading font / auth) -> allow tanpa redirect
      expect(
        evaluateNavigationGuard({
          isReady: false,
          session: null,
          user: null,
          segments: ["(admin)", "dashboard"],
        })
      ).toEqual({ action: "allow" });

      // 2. Belum login: diarahkan ke login jika berada di luar login/register
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: null,
          user: null,
          segments: [],
        })
      ).toEqual({ action: "redirect", targetHref: "/(auth)/login" });

      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: null,
          user: null,
          segments: ["(admin)", "dashboard"],
        })
      ).toEqual({ action: "redirect", targetHref: "/(auth)/login" });

      // Belum login di login/register -> diizinkan
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: null,
          user: null,
          segments: ["(auth)", "login"],
        })
      ).toEqual({ action: "allow" });

      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: null,
          user: null,
          segments: ["(auth)", "register"],
        })
      ).toEqual({ action: "allow" });

      // 3. User Nonaktif: selalu diarahkan ke layar inactive kecuali jika sudah di layar inactive
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Nonaktif" },
          segments: ["(auth)", "login"],
        })
      ).toEqual({ action: "redirect", targetHref: "/(auth)/inactive" });

      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Nonaktif" },
          segments: ["(auth)", "inactive"],
        })
      ).toEqual({ action: "allow" });

      // 4. User Aktif di auth entry atau root: diarahkan ke dashboard role
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Admin", status: "Aktif" },
          segments: ["(auth)", "login"],
        })
      ).toEqual({ action: "redirect", targetHref: "/(admin)/dashboard" });

      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Aktif" },
          segments: [],
        })
      ).toEqual({ action: "redirect", targetHref: "/(kasir)/pos" });

      // 5. User di layar unauthorized: harus diizinkan tampil (mencegah redirect loop / flash)
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Aktif" },
          segments: ["(auth)", "unauthorized"],
        })
      ).toEqual({ action: "allow" });

      // 6. User mencoba mengakses grup role lain: diarahkan ke unauthorized
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Aktif" },
          segments: ["(admin)", "dashboard"],
        })
      ).toEqual({ action: "redirect", targetHref: "/(auth)/unauthorized" });

      // 7. User mengakses rute grup miliknya: diizinkan
      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Kasir", status: "Aktif" },
          segments: ["(kasir)", "pos"],
        })
      ).toEqual({ action: "allow" });

      expect(
        evaluateNavigationGuard({
          isReady: true,
          session: { user: {} },
          user: { role: "Admin", status: "Aktif" },
          segments: ["(admin)", "inventory"],
        })
      ).toEqual({ action: "allow" });
    });

    it("menyembunyikan FloatingTabBar saat layar aktif mengonfigurasi tabBarStyle display none", () => {
      const mockState = {
        index: 1,
        routes: [
          { key: "dashboard-key", name: "dashboard" },
          { key: "category-key", name: "category" },
        ],
      };

      const mockDescriptors = {
        "dashboard-key": {
          options: { title: "Dashboard" },
        },
        "category-key": {
          options: {
            title: "Kategori",
            tabBarItemStyle: { display: "none" },
            tabBarStyle: { display: "none" },
          },
        },
      };

      // Saat di halaman category (index 1), FloatingTabBar mengembalikan null
      const hiddenMarkup = renderToStaticMarkup(
        <FloatingTabBar
          state={mockState}
          descriptors={mockDescriptors}
        />
      );
      expect(hiddenMarkup).toBe("");

      // Saat di halaman dashboard (index 0), FloatingTabBar merender pill capsule
      const visibleMarkup = renderToStaticMarkup(
        <FloatingTabBar
          state={{ ...mockState, index: 0 }}
          descriptors={mockDescriptors}
        />
      );
      expect(visibleMarkup).not.toBe("");
    });
  });
});
