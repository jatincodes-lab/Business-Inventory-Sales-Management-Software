import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export default function Page() {
  return (
    <Card>
      <CardHeader><CardTitle className="text-2xl">Check your email</CardTitle><CardDescription>Your account was created successfully.</CardDescription></CardHeader>
      <CardContent><p className="text-sm text-muted-foreground">Open the confirmation link sent to your email, including your spam folder if needed. After confirmation, return here to sign in.</p><Link href="/auth/login" className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#00a63e] px-4 text-sm font-semibold text-white transition hover:bg-[#008a34]">Go to sign in</Link></CardContent>
    </Card>
  );
}
