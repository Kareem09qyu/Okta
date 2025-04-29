import { NextRequest, NextResponse } from 'next/server';
import { confirmTwoFactor } from '../../auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, code } = body;

    if (!userId || !code) {
      return NextResponse.json(
        { success: false, message: 'يجب توفير معرف المستخدم ورمز التحقق' },
        { status: 400 }
      );
    }

    // تحويل userId إلى رقم
    const userIdNum = parseInt(userId, 10);
    if (isNaN(userIdNum)) {
        return NextResponse.json(
            { success: false, message: 'معرف المستخدم غير صالح' },
            { status: 400 }
        );
    }

    const result = await confirmTwoFactor(userIdNum, code);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in confirm-2fa API:', error);
    return NextResponse.json(
      { success: false, message: 'حدث خطأ أثناء تأكيد المصادقة ذات العاملين' },
      { status: 500 }
    );
  }
}
