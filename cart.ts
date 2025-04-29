import { getDatabase, DatabaseInterface, getCurrentUserId } from "./db";
import { cookies } from "next/headers";

export interface Env {
  DB: D1Database;
}

export interface CartItem {
  id: number;
  user_id: number;
  product_id: number;
  quantity: number;
  created_at: string;
  updated_at: string;
  product_name: string;
  product_price: number;
  product_image: string | null;
}

// دالة لإضافة منتج إلى سلة التسوق
export async function addToCart(productId: number, quantity: number = 1): Promise<{ success: boolean; message: string }> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return { success: false, message: "يجب تسجيل الدخول أولاً" };
    }
    
    const db = await getDatabase();
    
    // التحقق من وجود المنتج
    const product = await db.get<{ id: number; stock_quantity: number }>(
      "SELECT id, stock_quantity FROM products WHERE id = ?",
      [productId]
    );
    
    if (!product) {
      return { success: false, message: "المنتج غير موجود" };
    }
    
    if (product.stock_quantity < quantity) {
      return { success: false, message: "الكمية المطلوبة غير متوفرة في المخزون" };
    }
    
    // التحقق من وجود المنتج في السلة
    const existingItem = await db.get<{ id: number; quantity: number }>(
      "SELECT id, quantity FROM cart_items WHERE user_id = ? AND product_id = ?",
      [userId, productId]
    );
    
    if (existingItem) {
      // تحديث الكمية
      const newQuantity = existingItem.quantity + quantity;
      
      if (newQuantity > product.stock_quantity) {
        return { success: false, message: "الكمية المطلوبة غير متوفرة في المخزون" };
      }
      
      await db.execute(
        "UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [newQuantity, existingItem.id]
      );
      
      return { success: true, message: "تم تحديث الكمية في سلة التسوق" };
    }
    
    // إضافة منتج جديد إلى السلة
    await db.execute(
      "INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)",
      [userId, productId, quantity]
    );
    
    return { success: true, message: "تمت إضافة المنتج إلى سلة التسوق" };
  } catch (error) {
    console.error("Error adding to cart:", error);
    return { success: false, message: "حدث خطأ أثناء إضافة المنتج إلى سلة التسوق" };
  }
}

// دالة لجلب محتويات سلة التسوق
export async function getCartItems(): Promise<{ items: CartItem[]; total: number }> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return { items: [], total: 0 };
    }
    
    const db = await getDatabase();
    
    const results = await db.query<CartItem>(`
      SELECT 
        c.id, 
        c.user_id, 
        c.product_id, 
        c.quantity, 
        c.created_at, 
        c.updated_at,
        p.name as product_name,
        p.price as product_price,
        p.image_url as product_image
      FROM 
        cart_items c
      JOIN 
        products p ON c.product_id = p.id
      WHERE 
        c.user_id = ?
      ORDER BY 
        c.created_at DESC
    `, [userId]);
    
    const items = results || [];
    
    // حساب المجموع الكلي
    const total = items.reduce((sum, item) => sum + (item.product_price * item.quantity), 0);
    
    return { items, total };
  } catch (error) {
    console.error("Error getting cart items:", error);
    return { items: [], total: 0 };
  }
}

// دالة لتحديث كمية منتج في سلة التسوق
export async function updateCartItemQuantity(cartItemId: number, quantity: number): Promise<{ success: boolean; message: string }> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return { success: false, message: "يجب تسجيل الدخول أولاً" };
    }
    
    const db = await getDatabase();
    
    // التحقق من وجود العنصر في السلة
    const cartItem = await db.get<{ product_id: number }>(
      "SELECT product_id FROM cart_items WHERE id = ? AND user_id = ?",
      [cartItemId, userId]
    );
    
    if (!cartItem) {
      return { success: false, message: "العنصر غير موجود في سلة التسوق" };
    }
    
    // التحقق من توفر الكمية في المخزون
    const product = await db.get<{ stock_quantity: number }>(
      "SELECT stock_quantity FROM products WHERE id = ?",
      [cartItem.product_id]
    );
    
    if (!product || product.stock_quantity < quantity) {
      return { success: false, message: "الكمية المطلوبة غير متوفرة في المخزون" };
    }
    
    if (quantity <= 0) {
      // حذف العنصر من السلة
      await db.execute(
        "DELETE FROM cart_items WHERE id = ?",
        [cartItemId]
      );
      
      return { success: true, message: "تم حذف المنتج من سلة التسوق" };
    }
    
    // تحديث الكمية
    await db.execute(
      "UPDATE cart_items SET quantity = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [quantity, cartItemId]
    );
    
    return { success: true, message: "تم تحديث الكمية في سلة التسوق" };
  } catch (error) {
    console.error("Error updating cart item quantity:", error);
    return { success: false, message: "حدث خطأ أثناء تحديث الكمية" };
  }
}

// دالة لحذف منتج من سلة التسوق
export async function removeFromCart(cartItemId: number): Promise<{ success: boolean; message: string }> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return { success: false, message: "يجب تسجيل الدخول أولاً" };
    }
    
    const db = await getDatabase();
    
    // التحقق من وجود العنصر في السلة
    const cartItem = await db.get<{ id: number }>(
      "SELECT id FROM cart_items WHERE id = ? AND user_id = ?",
      [cartItemId, userId]
    );
    
    if (!cartItem) {
      return { success: false, message: "العنصر غير موجود في سلة التسوق" };
    }
    
    // حذف العنصر من السلة
    await db.execute(
      "DELETE FROM cart_items WHERE id = ?",
      [cartItemId]
    );
    
    return { success: true, message: "تم حذف المنتج من سلة التسوق" };
  } catch (error) {
    console.error("Error removing from cart:", error);
    return { success: false, message: "حدث خطأ أثناء حذف المنتج من سلة التسوق" };
  }
}

// دالة لإفراغ سلة التسوق
export async function clearCart(): Promise<{ success: boolean; message: string }> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return { success: false, message: "يجب تسجيل الدخول أولاً" };
    }
    
    const db = await getDatabase();
    
    // حذف جميع العناصر من السلة
    await db.execute(
      "DELETE FROM cart_items WHERE user_id = ?",
      [userId]
    );
    
    return { success: true, message: "تم إفراغ سلة التسوق" };
  } catch (error) {
    console.error("Error clearing cart:", error);
    return { success: false, message: "حدث خطأ أثناء إفراغ سلة التسوق" };
  }
}
