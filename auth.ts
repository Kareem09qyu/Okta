import { getDatabase, DatabaseInterface, getCurrentUserId } from "./db";
import { cookies } from "next/headers";
import * as bcrypt from "bcryptjs";
import * as speakeasy from "speakeasy";
import * as qrcode from "qrcode";

export interface Env {
  DB: D1Database;
}

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  full_name: string | null;
  address: string | null;
  phone: string | null;
  is_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface TwoFactorAuth {
  id: number;
  user_id: number;
  secret_key: string;
  is_enabled: boolean;
  created_at: string;
}

// دالة لتسجيل مستخدم جديد
export async function registerUser(userData: {
  username: string;
  email: string;
  password: string;
  full_name?: string;
}): Promise<{ success: boolean; message: string; userId?: number }> {
  try {
    const db = await getDatabase();
    
    // التحقق من وجود المستخدم
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [userData.username, userData.email]
    );
    
    if (existingUser) {
      return { success: false, message: "اسم المستخدم أو البريد الإلكتروني مستخدم بالفعل" };
    }
    
    // تشفير كلمة المرور
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(userData.password, salt);
    
    // إنشاء المستخدم - SQLite لا يدعم RETURNING بشكل مباشر في كل الحالات، سنستخدم lastID
    await db.execute(
      "INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)",
      [userData.username, userData.email, password_hash, userData.full_name || null]
    );
    
    // الحصول على معرف المستخدم الجديد (يعتمد على طريقة التنفيذ في db.ts، قد تحتاج لتعديل)
    // افتراض أن db.execute يمكنه بطريقة ما إرجاع lastID أو أن هناك دالة منفصلة لذلك
    // تعديل: سنستخدم استعلام منفصل للحصول على المعرف
    const newUser = await db.get<{ id: number }>("SELECT id FROM users WHERE username = ?", [userData.username]);
    
    if (!newUser) {
      return { success: false, message: "فشل في إنشاء المستخدم" };
    }
    const userId = newUser.id;
    
    // إنشاء مفتاح المصادقة ذات العاملين
    const secret = speakeasy.generateSecret({ length: 20, name: `متجر الملابس - ${userData.username}` });
    
    await db.execute(
      "INSERT INTO user_2fa (user_id, secret_key, is_enabled) VALUES (?, ?, ?)",
      [userId, secret.base32, false]
    );
    
    return { 
      success: true, 
      message: "تم تسجيل المستخدم بنجاح", 
      userId: userId 
    };
  } catch (error) {
    console.error("Error registering user:", error);
    return { success: false, message: "حدث خطأ أثناء تسجيل المستخدم" };
  }
}

// دالة لتسجيل الدخول
export async function loginUser(credentials: {
  username: string;
  password: string;
}): Promise<{ success: boolean; message: string; requireTwoFactor?: boolean; userId?: number }> {
  try {
    const db = await getDatabase();
    
    // البحث عن المستخدم
    const user = await db.get<{ id: number; username: string; password_hash: string }>(
      "SELECT id, username, password_hash FROM users WHERE username = ?",
      [credentials.username]
    );
    
    if (!user) {
      return { success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" };
    }
    
    // التحقق من كلمة المرور
    const isPasswordValid = await bcrypt.compare(credentials.password, user.password_hash);
    
    if (!isPasswordValid) {
      return { success: false, message: "اسم المستخدم أو كلمة المرور غير صحيحة" };
    }
    
    // التحقق من حالة المصادقة ذات العاملين
    const twoFactorAuth = await db.get<{ is_enabled: boolean }>(
      "SELECT is_enabled FROM user_2fa WHERE user_id = ?",
      [user.id]
    );
    
    if (twoFactorAuth && twoFactorAuth.is_enabled) {
      // إذا كانت المصادقة ذات العاملين مفعلة، يجب التحقق من الرمز
      return { 
        success: true, 
        message: "يرجى إدخال رمز المصادقة ذات العاملين", 
        requireTwoFactor: true,
        userId: user.id
      };
    }
    
    // إنشاء جلسة للمستخدم
    const cookieStore = cookies();
    cookieStore.set("user_id", user.id.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // تأمين الكوكيز في الإنتاج فقط
      maxAge: 60 * 60 * 24 * 7, // أسبوع واحد
      path: "/"
    });
    
    return { 
      success: true, 
      message: "تم تسجيل الدخول بنجاح", 
      userId: user.id 
    };
  } catch (error) {
    console.error("Error logging in:", error);
    return { success: false, message: "حدث خطأ أثناء تسجيل الدخول" };
  }
}

// دالة للتحقق من رمز المصادقة ذات العاملين
export async function verifyTwoFactorCode(userId: number, code: string): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDatabase();
    
    // الحصول على المفتاح السري للمستخدم
    const twoFactorAuth = await db.get<{ secret_key: string }>(
      "SELECT secret_key FROM user_2fa WHERE user_id = ?",
      [userId]
    );
    
    if (!twoFactorAuth) {
      return { success: false, message: "لم يتم العثور على إعدادات المصادقة ذات العاملين" };
    }
    
    // التحقق من الرمز
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret_key,
      encoding: "base32",
      token: code,
      window: 1 // السماح بانحراف زمني قدره 30 ثانية
    });
    
    if (!isValid) {
      return { success: false, message: "رمز المصادقة غير صحيح" };
    }
    
    // إنشاء جلسة للمستخدم
    const cookieStore = cookies();
    cookieStore.set("user_id", userId.toString(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 7, // أسبوع واحد
      path: "/"
    });
    
    return { success: true, message: "تم التحقق بنجاح" };
  } catch (error) {
    console.error("Error verifying 2FA code:", error);
    return { success: false, message: "حدث خطأ أثناء التحقق من الرمز" };
  }
}

// دالة لتفعيل المصادقة ذات العاملين
export async function enableTwoFactor(userId: number): Promise<{ 
  success: boolean; 
  message: string; 
  qrCodeUrl?: string;
  secretKey?: string;
}> {
  try {
    const db = await getDatabase();
    
    // الحصول على معلومات المستخدم
    const user = await db.get<{ username: string }>(
      "SELECT username FROM users WHERE id = ?",
      [userId]
    );
    
    if (!user) {
      return { success: false, message: "لم يتم العثور على المستخدم" };
    }
    
    // الحصول على المفتاح السري الحالي أو إنشاء مفتاح جديد
    let twoFactorAuth = await db.get<{ id: number; secret_key: string }>(
      "SELECT id, secret_key FROM user_2fa WHERE user_id = ?",
      [userId]
    );
    
    let secretKey;
    
    if (!twoFactorAuth) {
      // إنشاء مفتاح جديد
      const secret = speakeasy.generateSecret({ length: 20, name: `متجر الملابس - ${user.username}` });
      secretKey = secret.base32;
      
      await db.execute(
        "INSERT INTO user_2fa (user_id, secret_key, is_enabled) VALUES (?, ?, ?)",
        [userId, secretKey, false]
      );
    } else {
      secretKey = twoFactorAuth.secret_key;
    }
    
    // إنشاء رمز QR
    const otpAuthUrl = `otpauth://totp/متجر الملابس:${user.username}?secret=${secretKey}&issuer=متجر الملابس`;
    const qrCodeUrl = await qrcode.toDataURL(otpAuthUrl);
    
    return { 
      success: true, 
      message: "تم إنشاء مفتاح المصادقة ذات العاملين بنجاح", 
      qrCodeUrl,
      secretKey
    };
  } catch (error) {
    console.error("Error enabling 2FA:", error);
    return { success: false, message: "حدث خطأ أثناء تفعيل المصادقة ذات العاملين" };
  }
}

// دالة لتأكيد تفعيل المصادقة ذات العاملين
export async function confirmTwoFactor(userId: number, code: string): Promise<{ success: boolean; message: string }> {
  try {
    const db = await getDatabase();
    
    // الحصول على المفتاح السري للمستخدم
    const twoFactorAuth = await db.get<{ secret_key: string }>(
      "SELECT secret_key FROM user_2fa WHERE user_id = ?",
      [userId]
    );
    
    if (!twoFactorAuth) {
      return { success: false, message: "لم يتم العثور على إعدادات المصادقة ذات العاملين" };
    }
    
    // التحقق من الرمز
    const isValid = speakeasy.totp.verify({
      secret: twoFactorAuth.secret_key,
      encoding: "base32",
      token: code,
      window: 1
    });
    
    if (!isValid) {
      return { success: false, message: "رمز المصادقة غير صحيح" };
    }
    
    // تفعيل المصادقة ذات العاملين
    await db.execute(
      "UPDATE user_2fa SET is_enabled = 1 WHERE user_id = ?",
      [userId]
    );
    
    return { success: true, message: "تم تفعيل المصادقة ذات العاملين بنجاح" };
  } catch (error) {
    console.error("Error confirming 2FA:", error);
    return { success: false, message: "حدث خطأ أثناء تأكيد المصادقة ذات العاملين" };
  }
}

// دالة للتحقق من حالة المستخدم الحالي
export async function getCurrentUser(): Promise<User | null> {
  try {
    const userId = getCurrentUserId();
    
    if (!userId) {
      return null;
    }
    
    const db = await getDatabase();
    
    const user = await db.get<User>(
      "SELECT id, username, email, full_name, address, phone, is_admin, created_at, updated_at FROM users WHERE id = ?",
      [userId]
    );
    
    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

// دالة لتسجيل الخروج
export function logout(): void {
  const cookieStore = cookies();
  cookieStore.delete("user_id");
}
