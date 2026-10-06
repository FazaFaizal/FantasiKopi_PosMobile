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
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: 'Admin' | 'Kasir' | 'Customer';
          status?: 'Aktif' | 'Nonaktif';
          employee_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: 'Admin' | 'Kasir' | 'Customer';
          status?: 'Aktif' | 'Nonaktif';
          employee_id?: string | null;
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
          is_deleted: boolean;
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
          payment_method: 'Tunai' | 'QRIS';
          payment_status: 'Lunas' | 'Batal';
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          user_id?: string | null;
          cashier_name?: string | null;
          customer_name?: string | null;
          total_amount: number;
          payment_method: 'Tunai' | 'QRIS';
          payment_status?: 'Lunas' | 'Batal';
          notes?: string | null;
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
          payment_method?: 'Tunai' | 'QRIS';
          payment_status?: 'Lunas' | 'Batal';
          notes?: string | null;
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
