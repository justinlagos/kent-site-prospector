export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <form method="POST" action="/api/login" className="bg-white border border-slate-200 rounded-xl p-8 w-full max-w-sm shadow-sm space-y-4">
        <h1 className="text-xl font-bold">Kent Site Prospector</h1>
        <p className="text-sm text-slate-500">Internal dashboard — authorised users only.</p>
        {params.error && <p className="text-sm text-red-600">Login failed. Check your details or wait 15 minutes.</p>}
        <label className="block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="username" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input name="password" type="password" required autoComplete="current-password" className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2" />
        </label>
        <button className="w-full bg-slate-900 text-white rounded-lg py-2 font-semibold hover:bg-slate-700">Sign in</button>
      </form>
    </main>
  );
}
