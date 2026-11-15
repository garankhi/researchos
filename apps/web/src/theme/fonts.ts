import { Geist_Mono, Inter, Manrope } from 'next/font/google';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin', 'vietnamese'],
});

const manrope = Manrope({
  variable: '--font-manrope',
  subsets: ['latin', 'vietnamese'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const fontVariableClasses = [
  inter.variable,
  manrope.variable,
  geistMono.variable,
];
