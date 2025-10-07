"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Loader from "./components/loader/Loader.component";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const get = () => {
      setTimeout(() => {
        router.push("/page/login");
      }, 3000);
    };
    get()
  }, [router]);

  return <Loader />;
}
