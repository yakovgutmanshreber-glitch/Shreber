export default function PaymentComplete() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-green-50 to-white px-4">
      <div className="card max-w-md p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">
          ✓
        </div>
        <h1 className="text-2xl font-bold text-gray-900">התשלום הושלם בהצלחה</h1>
        <p className="mt-2 text-sm text-gray-500">
          תודה! ניתן לסגור חלון זה. הפרטים יעודכנו במערכת אוטומטית.
        </p>
      </div>
    </div>
  );
}
