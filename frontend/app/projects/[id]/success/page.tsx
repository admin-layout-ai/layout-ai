import PaymentSuccessClient from './PaymentSuccessClient';

export async function generateStaticParams() {
  return [];
}

export default function PaymentSuccessPage() {
  return <PaymentSuccessClient />;
}