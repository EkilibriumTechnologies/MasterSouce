import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const url = request.nextUrl?.toString() ?? request.url;
  console.log("[UPLOAD_DEBUG] request:start", {
    method: request.method,
    url,
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length")
  });

  try {
    console.log("[UPLOAD_DEBUG] formData:start");
    const formData = await request.formData();
    console.log("[UPLOAD_DEBUG] formData:success", { keys: Array.from(formData.keys()) });

    const file = formData.get("audio");
    if (!(file instanceof File)) {
      console.log("[UPLOAD_DEBUG] return:no_file");
      return NextResponse.json({ ok: false, error: "Expected an \"audio\" file field." }, { status: 400 });
    }

    console.log("[UPLOAD_DEBUG] return:success", {
      name: file.name,
      type: file.type,
      size: file.size
    });
    return NextResponse.json({ ok: true, name: file.name, type: file.type, size: file.size });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.log("[UPLOAD_DEBUG] catch:error", { name, message, stack });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
