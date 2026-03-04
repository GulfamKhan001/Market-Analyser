"use client";

import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { portfolioAPI } from "@/lib/api";

type Format = "standard" | "vested";

const FORMAT_INFO: Record<Format, { label: string; columns: string; description: string }> = {
  standard: {
    label: "Standard CSV",
    columns: "ticker, entry_date, entry_price, quantity",
    description: "Generic portfolio export format",
  },
  vested: {
    label: "Vested Export",
    columns: "Name, Ticker, Qty, Avg Cost, Current Value, Return",
    description: "Direct export from Vested app",
  },
};

interface CsvUploadProps {
  onImportSuccess?: () => void;
}

export function CsvUpload({ onImportSuccess }: CsvUploadProps) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<Format>("standard");
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[]>([]);

  const importMutation = useMutation({
    mutationFn: (file: File) => {
      if (format === "vested") {
        return portfolioAPI.importVested(file);
      }
      const formData = new FormData();
      formData.append("file", file);
      return fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/portfolio/import-csv`,
        { method: "POST", body: formData },
      ).then((r) => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-summary"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setSelectedFile(null);
      setPreview([]);
      onImportSuccess?.();
    },
  });

  const handleFile = useCallback((file: File) => {
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split("\n").slice(0, 6);
      setPreview(lines);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files.length) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const clearFile = () => {
    setSelectedFile(null);
    setPreview([]);
    importMutation.reset();
  };

  const info = FORMAT_INFO[format];

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-800 p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-200">Import Portfolio</h3>
            <p className="text-xs text-gray-500">Upload positions from CSV</p>
          </div>
        </div>
      </div>

      {/* Format toggle */}
      <div className="flex gap-1 p-1 bg-gray-800/60 rounded-lg mb-4">
        {(Object.keys(FORMAT_INFO) as Format[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFormat(f); clearFile(); }}
            className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              format === f
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            {FORMAT_INFO[f].label}
          </button>
        ))}
      </div>

      {/* Expected columns hint */}
      <div className="mb-3 px-3 py-2 bg-gray-800/40 rounded-md border border-gray-800">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          <span className="text-gray-400 font-medium">{info.description}</span>
          {" — "}
          <span className="font-mono">{info.columns}</span>
        </p>
      </div>

      {/* Drop zone */}
      {!selectedFile ? (
        <div
          onDrop={handleDrop}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".csv";
            input.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleFile(file);
            };
            input.click();
          }}
          className={`relative rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? "border-blue-500 bg-blue-500/5 scale-[1.01]"
              : "border-gray-700/60 hover:border-gray-600 hover:bg-gray-800/30"
          }`}
        >
          <div className="flex flex-col items-center gap-2">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              dragActive ? "bg-blue-500/15" : "bg-gray-800"
            }`}>
              <svg className={`w-5 h-5 ${dragActive ? "text-blue-400" : "text-gray-500"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-300">
                Drop your <span className="font-medium text-gray-200">.csv</span> file here
              </p>
              <p className="text-xs text-gray-500 mt-0.5">or click to browse</p>
            </div>
          </div>
        </div>
      ) : (
        /* File selected state */
        <div className="space-y-3">
          {/* File info bar */}
          <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800/60 rounded-lg border border-gray-700/50">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-sm text-gray-200 font-medium truncate">{selectedFile.name}</p>
                <p className="text-[11px] text-gray-500">{(selectedFile.size / 1024).toFixed(1)} KB</p>
              </div>
            </div>
            <button
              onClick={clearFile}
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 rounded-md transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-[11px] text-gray-500 mb-1.5 font-medium uppercase tracking-wider">Preview</p>
              <div className="bg-gray-950/60 rounded-md border border-gray-800 p-2.5 overflow-x-auto">
                {preview.map((line, i) => (
                  <p
                    key={i}
                    className={`text-[11px] font-mono leading-relaxed ${
                      i === 0 ? "text-blue-400/70 font-semibold" : "text-gray-400"
                    }`}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Import button */}
          <button
            onClick={() => importMutation.mutate(selectedFile)}
            disabled={importMutation.isPending}
            className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {importMutation.isPending ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing...
              </>
            ) : (
              `Import ${info.label}`
            )}
          </button>
        </div>
      )}

      {/* Status messages */}
      {importMutation.isSuccess && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <svg className="w-4 h-4 text-green-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-green-400">Positions imported successfully</p>
        </div>
      )}
      {importMutation.isError && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg">
          <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-xs text-red-400">Import failed: {(importMutation.error as Error).message}</p>
        </div>
      )}
    </div>
  );
}
