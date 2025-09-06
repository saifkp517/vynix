import { promises as fs } from "fs";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const path = process.cwd() + "/public/POS.json";
    const file = await fs.readFile(path, "utf8");
    const data = JSON.parse(file);
    return NextResponse.json(data);
  } catch (error) {
    console.log(error)
    return NextResponse.json({ error: "Failed to read file" }, { status: 500 });
  }
}
