import { getDatabase, DatabaseInterface } from "./db";

export interface Env {
  DB: D1Database;
}

export interface Product {
  id: number;
  category_id: number | null;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null;
  stock_quantity: number;
  image_url: string | null;
  is_featured: boolean;
  created_at: string;
  updated_at: string;
}

// دالة لجلب جميع المنتجات
export async function getAllProducts(): Promise<Product[]> {
  try {
    const db = await getDatabase();
    const results = await db.query<Product>("SELECT * FROM products ORDER BY created_at DESC");
    return results || [];
  } catch (error) {
    console.error("Error fetching products:", error);
    return [];
  }
}

// دالة لجلب المنتجات المميزة
export async function getFeaturedProducts(): Promise<Product[]> {
  try {
    const db = await getDatabase();
    const results = await db.query<Product>("SELECT * FROM products WHERE is_featured = 1 ORDER BY created_at DESC");
    return results || [];
  } catch (error) {
    console.error("Error fetching featured products:", error);
    return [];
  }
}

// دالة لجلب منتج واحد بواسطة المعرف
export async function getProductById(id: number): Promise<Product | null> {
  try {
    const db = await getDatabase();
    const product = await db.get<Product>("SELECT * FROM products WHERE id = ?", [id]);
    return product;
  } catch (error) {
    console.error(`Error fetching product with id ${id}:`, error);
    return null;
  }
}

