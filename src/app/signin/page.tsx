import { SignInForm } from "@/components/auth/SignInForm";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "CHRP // Sign in",
};

export default function SignInPage() {
  return (
    <div className="product-shell">
      <SiteHeader showCta={false} showSignIn={false} />
      <main>
        <section className="pad-md">
          <SignInForm />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
