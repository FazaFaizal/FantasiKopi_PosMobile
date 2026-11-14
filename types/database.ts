export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string;
          name: string;
          phone: string | null;
          email: string | null;
          position: string | null;
          start_date: string | null;
          status: 'Aktif' | 'Nonaktif';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          position?: string | null;
          start_date?: string | null;
          status?: 'Aktif' | 'Nonaktif';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          position?: string | null;
          start_date?: string | null;
          status?: 'Aktif' | 'Nonaktif';
          created_at?: string;
          updated_at?: string;
        };
      };
      users: {
        Row: {
          id: string;
          email: string;
          role: 'Admin' | 'Kasir' | 'Customer';
          status: 'Aktif' | 'Nonaktif';
          employee_id: string | null;
          /** Nama dari registrasi (customer) atau data karyawan (staf). */
          full_name: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: 'Admin' | 'Kasir' | 'Customer';
          status?: 'Aktif' | 'Nonaktif';
          employee_id?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: 'Admin' | 'Kasir' | 'Customer';
          status?: 'Aktif' | 'Nonaktif';
          employee_id?: string | null;
          full_name?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          status: 'Aktif' | 'Nonaktif';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          status?: 'Aktif' | 'Nonaktif';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          status?: 'Aktif' | 'Nonaktif';
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          category_id: string | null;
          price: number;
          image: string | null;
          status: 'Tersedia' | 'Tidak Tersedia';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          category_id?: string | null;
          price: number;
          image?: string | null;
          status?: 'Tersedia' | 'Tidak Tersedia';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          category_id?: string | null;
          price?: number;
          image?: string | null;
          status?: 'Tersedia' | 'Tidak Tersedia';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory_items: {
        Row: {
          id: string;
          name: string;
          unit: string;
          current_stock: number;
          min_stock: number;
          notes: string | null;
          /** Tidak dipakai lagi; digantikan is_active. */
          is_deleted: boolean;
          /** Bahan nonaktif disembunyikan dari kasir dan tidak bisa dimutasi. Hanya Admin yang mengubah. */
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          unit: string;
          current_stock?: number;
          min_stock?: number;
          notes?: string | null;
          is_deleted?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          unit?: string;
          current_stock?: number;
          min_stock?: number;
          notes?: string | null;
          is_deleted?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          inventory_id: string | null;
          item_name: string | null;
          item_unit: string | null;
          user_name: string | null;
          movement_type: 'Stock In' | 'Stock Out' | 'Stock Adjustment';
          quantity: number;
          stock_before: number;
          stock_after: number;
          notes: string | null;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          inventory_id?: string | null;
          item_name?: string | null;
          item_unit?: string | null;
          user_name?: string | null;
          movement_type: 'Stock In' | 'Stock Out' | 'Stock Adjustment';
          quantity: number;
          stock_before: number;
          stock_after: number;
          notes?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          inventory_id?: string | null;
          item_name?: string | null;
          item_unit?: string | null;
          user_name?: string | null;
          movement_type?: 'Stock In' | 'Stock Out' | 'Stock Adjustment';
          quantity?: number;
          stock_before?: number;
          stock_after?: number;
          notes?: string | null;
          user_id?: string | null;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          cashier_name: string | null;
          customer_name: string | null;
          total_amount: number;
          payment_method: 'Tunai' | 'QRIS' | 'Debit';
          payment_status: 'Pending' | 'Paid' | 'Failed' | 'Refunded';
          order_status: 'Pending' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
          order_type: 'Dine In' | 'Take Away';
          notes: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          cancellation_reason: string | null;
          paid_at: string | null;
          /** Batas bayar pesanan customer (created_at + 15 menit), diisi trigger database. */
          payment_due_at: string | null;
          payment_channel: 'Kasir' | 'Online';
          gateway_status: string | null;
          gateway_payment_type: string | null;
          gateway_transaction_id: string | null;
          gateway_redirect_url: string | null;
          gateway_updated_at: string | null;
          paid_shift_id: string | null;
          refunded_shift_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          /** Diisi otomatis oleh trigger `assign_order_number` (nilai dari klien diabaikan). */
          order_number?: string;
          user_id?: string | null;
          cashier_name?: string | null;
          customer_name?: string | null;
          total_amount: number;
          payment_method: 'Tunai' | 'QRIS' | 'Debit';
          payment_status?: 'Pending' | 'Paid' | 'Failed' | 'Refunded';
          order_status?: 'Pending' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
          order_type?: 'Dine In' | 'Take Away';
          notes?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          paid_at?: string | null;
          payment_due_at?: string | null;
          payment_channel?: 'Kasir' | 'Online';
          gateway_status?: string | null;
          gateway_payment_type?: string | null;
          gateway_transaction_id?: string | null;
          gateway_redirect_url?: string | null;
          gateway_updated_at?: string | null;
          paid_shift_id?: string | null;
          refunded_shift_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          user_id?: string | null;
          cashier_name?: string | null;
          customer_name?: string | null;
          total_amount?: number;
          payment_method?: 'Tunai' | 'QRIS' | 'Debit';
          payment_status?: 'Pending' | 'Paid' | 'Failed' | 'Refunded';
          order_status?: 'Pending' | 'Processing' | 'Ready' | 'Completed' | 'Cancelled';
          order_type?: 'Dine In' | 'Take Away';
          notes?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          cancellation_reason?: string | null;
          paid_at?: string | null;
          payment_due_at?: string | null;
          payment_channel?: 'Kasir' | 'Online';
          gateway_status?: string | null;
          gateway_payment_type?: string | null;
          gateway_transaction_id?: string | null;
          gateway_redirect_url?: string | null;
          gateway_updated_at?: string | null;
          paid_shift_id?: string | null;
          refunded_shift_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          subtotal: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          unit_price: number;
          quantity: number;
          subtotal: number;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          unit_price?: number;
          quantity?: number;
          subtotal?: number;
          notes?: string | null;
          created_at?: string;
        };
      };
      cash_shifts: {
        /** Ditulis hanya lewat RPC open_cash_shift / close_cash_shift. */
        Row: {
          id: string;
          status: 'Open' | 'Closed';
          opened_by: string | null;
          opened_by_name: string | null;
          opened_at: string;
          opening_cash: number;
          opening_note: string | null;
          closed_by: string | null;
          closed_by_name: string | null;
          closed_at: string | null;
          expected_cash: number | null;
          counted_cash: number | null;
          cash_withdrawn: number;
          difference: number | null;
          closing_note: string | null;
        };
        Insert: never;
        Update: never;
      };
      expenses: {
        Row: {
          id: string;
          description: string;
          category: 'Raw Material' | 'Operational' | 'Equipment' | 'Other';
          amount: number;
          expense_date: string;
          created_by: string | null;
          /** Terisi jika expense dibuat lewat Stock In (record_stock_in). */
          stock_movement_id: string | null;
          /** true = dibayar dari kas laci (uang penjualan hari itu). */
          paid_from_cash: boolean;
          shift_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          description: string;
          category: 'Raw Material' | 'Operational' | 'Equipment' | 'Other';
          amount: number;
          expense_date?: string;
          created_by?: string | null;
          stock_movement_id?: string | null;
          paid_from_cash?: boolean;
          shift_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          description?: string;
          category?: 'Raw Material' | 'Operational' | 'Equipment' | 'Other';
          amount?: number;
          expense_date?: string;
          created_by?: string | null;
          stock_movement_id?: string | null;
          paid_from_cash?: boolean;
          shift_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_staff: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      get_shift_summary: {
        Args: { p_shift_id?: string | null };
        Returns: Record<string, unknown> | null;
      };
      open_cash_shift: {
        Args: { p_opening_cash: number; p_note?: string | null };
        Returns: Record<string, unknown>;
      };
      close_cash_shift: {
        Args: { p_counted: number; p_withdrawn?: number; p_note?: string | null };
        Returns: Record<string, unknown>;
      };
      business_today: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      create_order: {
        Args: {
          p_items: { product_id: string; quantity: number; notes: string | null }[];
          p_customer_name: string;
          p_order_type: 'Dine In' | 'Take Away';
          p_payment_method: 'Tunai' | 'QRIS' | 'Debit';
          p_notes?: string | null;
          p_payment_channel?: 'Kasir' | 'Online';
        };
        Returns: {
          id: string;
          order_number: string;
          total_amount: number;
          order_status: string;
          payment_status: string;
          created_at: string;
          payment_due_at: string | null;
          payment_channel: 'Kasir' | 'Online';
        };
      };
      expire_unpaid_orders: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      get_recent_activity: {
        Args: { p_limit?: number; p_category?: string | null };
        /** Array baris aktivitas (lib/activity-logic.ts → ActivityRow). */
        Returns: unknown;
      };
      cancel_my_order: {
        Args: { p_order_id: string; p_reason: string };
        Returns: { id: string; order_number: string; order_status: 'Cancelled' };
      };
      get_sales_summary: {
        Args: { p_from?: string | null; p_to?: string | null };
        Returns: Record<string, unknown> | null;
      };
      record_stock_movement: {
        Args: {
          p_inventory_id: string;
          p_movement_type: 'Stock Out' | 'Stock Adjustment';
          p_quantity: number;
          p_notes: string;
        };
        Returns: { movement_id: string; stock_before: number; stock_after: number };
      };
      record_stock_in: {
        Args: {
          p_inventory_id: string;
          p_quantity: number;
          p_notes?: string | null;
          p_purchase_amount?: number | null;
        };
        Returns: {
          movement_id: string;
          expense_id: string | null;
          stock_after: number;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Employee = Database['public']['Tables']['employees']['Row'];
export type User = Database['public']['Tables']['users']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type InventoryItem = Database['public']['Tables']['inventory_items']['Row'];
export type StockMovement = Database['public']['Tables']['stock_movements']['Row'];
export type Order = Database['public']['Tables']['orders']['Row'];
export type OrderItem = Database['public']['Tables']['order_items']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type CashShift = Database['public']['Tables']['cash_shifts']['Row'];
