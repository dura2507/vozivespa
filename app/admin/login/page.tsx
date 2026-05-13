import { LoginForm } from "./login-form";

export const metadata = { title: "Admin · SickMotos" };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return (
    <main className="min-h-screen bg-ink text-white flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <p className="text-[11px] tracking-[0.3em] uppercase text-white/40 mb-3">
          SickMotos · Admin
        </p>
        <h1 className="font-bold text-4xl mb-7">
          Sign in
        </h1>
        <LoginForm redirectTo={from ?? "/admin"} />
      </div>
    </main>
  );
}
