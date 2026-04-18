import { Skeleton } from "@/components/ui/skeleton";

export function PurchaseEntrySkeleton() {
  return (
    <div className="flex h-screen flex-col bg-[#fbfcf7]">
      {/* Header */}
      <div className="border-b border-[#cad5cb] bg-[#2f5d50] px-4 py-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32 bg-white/20" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-20 bg-white/20" />
            <Skeleton className="h-6 w-16 bg-white/20" />
          </div>
        </div>
      </div>

      {/* Vendor Details */}
      <div className="border-b bg-[#fbfcf7] px-3 py-2">
        <div className="grid gap-1">
          <div className="flex gap-4">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-3 w-48" />
          <div className="flex gap-4">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>

      {/* Form Fields */}
      <div className="grid gap-px bg-border md:grid-cols-12">
        <div className="bg-[#fbfcf7] p-1.5 md:col-span-3">
          <Skeleton className="mb-1 h-3 w-20" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="bg-[#fbfcf7] p-1.5 md:col-span-5">
          <Skeleton className="mb-1 h-3 w-12" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="bg-[#fbfcf7] p-1.5 md:col-span-2">
          <Skeleton className="mb-1 h-3 w-12" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="bg-[#fbfcf7] p-1.5 md:col-span-2">
          <Skeleton className="mb-1 h-3 w-12" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>

      {/* Second Row */}
      <div className="grid gap-px border-t bg-border md:grid-cols-12">
        <div className="bg-[#fbfcf7] p-1 md:col-span-4">
          <Skeleton className="mb-1 h-3 w-20" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="bg-[#fbfcf7] p-1 md:col-span-4">
          <Skeleton className="mb-1 h-3 w-16" />
          <Skeleton className="h-7 w-full" />
        </div>
        <div className="bg-[#fbfcf7] p-1 md:col-span-4">
          <Skeleton className="mb-1 h-3 w-16" />
          <Skeleton className="h-7 w-full" />
        </div>
      </div>

      {/* Table */}
      <div className="border-t overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Table Header */}
          <div className="flex bg-[#e7f0cb]">
            <div className="w-[30px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="flex-1 p-2"><Skeleton className="h-3 w-16" /></div>
            <div className="w-[60px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[60px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[60px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[65px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[65px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[55px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[50px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[75px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[90px] p-2"><Skeleton className="h-3 w-full" /></div>
            <div className="w-[90px] p-2"><Skeleton className="h-3 w-full" /></div>
          </div>
          {/* Table Rows */}
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex bg-[#fbfcf7]">
              <div className="w-[30px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="flex-1 p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[60px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[60px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[60px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[65px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[65px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[55px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[50px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[75px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[90px] p-0.5"><Skeleton className="h-7 w-full" /></div>
              <div className="w-[90px] p-0.5"><Skeleton className="h-7 w-full" /></div>
            </div>
          ))}
        </div>
      </div>

      {/* Selected Item and Totals */}
      <div className="grid gap-px border-t bg-border md:grid-cols-[1fr_1fr]">
        <div className="bg-[#fbfcf7] p-3">
          <Skeleton className="mb-2 h-3 w-20" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
            <div className="flex gap-4">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
        <div className="bg-[#fbfcf7] p-3">
          <div className="grid grid-cols-2 gap-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>

      {/* Recent Interaction History */}
      <div className="border-t bg-[#fbfcf7] p-3">
        <Skeleton className="mb-2 h-3 w-40" />
        <div className="overflow-x-auto">
          <div className="min-w-full">
            <div className="flex border-b border-[#dde6dc]">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="p-2"><Skeleton className="h-3 w-12" /></div>
              ))}
            </div>
            {[1, 2].map((i) => (
              <div key={i} className="flex border-b border-[#f0f4f0]">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                  <div key={j} className="p-2"><Skeleton className="h-3 w-12" /></div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
