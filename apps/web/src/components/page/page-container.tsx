import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
        className,
      )}
      {...props}
    />
  );
}
