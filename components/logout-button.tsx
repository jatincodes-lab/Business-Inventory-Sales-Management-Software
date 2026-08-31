"use client";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LogoutButton({ iconOnly = false }: { iconOnly?: boolean }) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const logout = async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/auth/login");
    } finally {
      setIsLoading(false);
    }
  };

  return <Button type="button" onClick={logout} loading={isLoading} variant={iconOnly ? "ghost" : "default"} size={iconOnly ? "icon" : "default"} aria-label={iconOnly ? "Log out" : undefined} title={iconOnly ? "Log out" : undefined} className={iconOnly ? "size-10 min-h-10 text-[#64748b] hover:bg-[#e6f8ee] hover:text-[#00a63e]" : undefined}>{iconOnly ? <LogOut className="size-[18px]" /> : "Logout"}</Button>;
}
