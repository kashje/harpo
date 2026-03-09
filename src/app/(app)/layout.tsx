import { AnimatedBackground } from "./_components/layout/animated-background";
import { Footer } from "./_components/layout/footer";
import { Header } from "./_components/layout/header";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="bg-background relative flex min-h-screen flex-col">
      <AnimatedBackground />

      <Header />

      <main className="relative z-10 flex-1">{children}</main>

      <Footer />
    </div>
  );
}
