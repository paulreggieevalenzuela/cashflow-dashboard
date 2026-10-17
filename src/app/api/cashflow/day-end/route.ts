import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  buildDayEndSheet,
  dayEndFileName,
  isValidIsoDate,
} from "@/lib/cashflow/day-end";
import { buildXlsx, toCsv, XLSX_CONTENT_TYPE } from "@/lib/cashflow/xlsx";
import { listBranches } from "@/lib/db/branches";
import { getDayEndReport, resolveDayEndScope } from "@/lib/db/day-end";

export const dynamic = "force-dynamic";

/**
 * Downloads the end-of-day report as Excel (.xlsx) or CSV:
 * /api/cashflow/day-end?date=2026-10-03&branch=<id | all>&format=xlsx|csv
 * Named ADT_EOD_<branch>_<date>. A person who belongs to a branch always
 * gets their own branch, whatever the link says.
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = request.nextUrl.searchParams;
  const date = params.get("date");
  if (!isValidIsoDate(date)) {
    return NextResponse.json(
      { error: "Give a date as YYYY-MM-DD." },
      { status: 400 },
    );
  }
  const format = params.get("format") === "csv" ? "csv" : "xlsx";

  const branchList = await listBranches();
  const scope = await resolveDayEndScope({
    userId: session.user.id,
    role: session.user.role,
    requested: params.get("branch") ?? undefined,
    branchList,
  });
  const report = await getDayEndReport({ branchId: scope.branchId, date });
  const sheet = buildDayEndSheet(report);
  const fileName = dayEndFileName(report.branchName, date);

  const headers = {
    "Cache-Control": "no-store",
    "Content-Disposition": `attachment; filename="${fileName}.${format}"`,
  };
  if (format === "csv") {
    return new NextResponse(toCsv(sheet.rows), {
      headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" },
    });
  }
  return new NextResponse(Buffer.from(buildXlsx([sheet])), {
    headers: { ...headers, "Content-Type": XLSX_CONTENT_TYPE },
  });
}
