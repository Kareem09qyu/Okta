// ملف وسيط للتعامل مع قاعدة البيانات بطريقة متوافقة مع بيئة التطوير المحلية وبيئة الإنتاج

import { cookies } from "next/headers";
import * as sqlite3 from "sqlite3";
import { open, Database } from "sqlite/sqlite3";

// واجهة لتمثيل قاعدة البيانات
export interface DatabaseInterface {
  query<T>(sql: string, params?: any[]): Promise<T[]>;
  execute(sql: string, params?: any[]): Promise<void>;
  get<T>(sql: string, params?: any[]): Promise<T | null>;
}

// فئة لقاعدة البيانات المحلية باستخدام SQLite
class LocalDatabase implements DatabaseInterface {
  private db: Database | null = null;
  private static instance: LocalDatabase | null = null;

  private constructor() {}

  public static async getInstance(): Promise<LocalDatabase> {
    if (!LocalDatabase.instance) {
      LocalDatabase.instance = new LocalDatabase();
      await LocalDatabase.instance.initialize();
    }
    return LocalDatabase.instance;
  }

  private async initialize(): Promise<void> {
    this.db = await open({
      filename: "/home/ubuntu/ecommerce-clothing-store/.local-db.sqlite",
      driver: sqlite3.Database
    });
  }

  public async query<T>(sql: string, params: any[] = []): Promise<T[]> {
    if (!this.db) await this.initialize();
    return await this.db!.all(sql, params);
  }

  public async execute(sql: string, params: any[] = []): Promise<void> {
    if (!this.db) await this.initialize();
    await this.db!.run(sql, params);
  }

  public async get<T>(sql: string, params: any[] = []): Promise<T | null> {
    if (!this.db) await this.initialize();
    return await this.db!.get(sql, params) || null;
  }
}

// دالة للحصول على قاعدة البيانات المناسبة للبيئة الحالية
export async function getDatabase(): Promise<DatabaseInterface> {
  // في بيئة التطوير المحلية، استخدم SQLite
  return await LocalDatabase.getInstance();
}

// دالة للحصول على معرف المستخدم الحالي من الكوكيز
export function getCurrentUserId(): number | null {
  const cookieStore = cookies();
  const userId = cookieStore.get("user_id")?.value;
  return userId ? parseInt(userId, 10) : null;
}
