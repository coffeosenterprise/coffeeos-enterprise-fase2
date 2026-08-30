import './globals.css';

export const metadata = {
  title: 'CoffeeOS Enterprise',
  description: 'Plataforma SaaS de administracion para negocios F&B',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
