"use client"

import React from "react"

import { useState, useCallback, useRef } from "react"
import { useSession } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import type { ImportStats, ColumnMapping } from "@/lib/types"
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  X,
} from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

type Step = "upload" | "mapping" | "preview" | "importing" | "done"

// API response type for CSV upload
interface ImportPreview {
  batchId: string
  filename?: string
  headers: string[]
  rows: string[][]
  totalRows: number
}

const REQUIRED_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: "title", label: "Title", required: true },
  { key: "author", label: "Author", required: true },
  { key: "rating", label: "Rating", required: true },
  { key: "isbn", label: "ISBN", required: false },
  { key: "date", label: "Date Read", required: false },
  { key: "tags", label: "Tags", required: false },
]

export default function ImportPage() {
  const { data: session } = useSession()
  const user = session?.user
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>("upload")
  const [isUploading, setIsUploading] = useState(false)
  const [batchId, setBatchId] = useState<string | null>(null)
  const [fileName, setFileName] = useState("")
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importStats, setImportStats] = useState<ImportStats | null>(null)
  const [dragActive, setDragActive] = useState(false)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a .csv file")
      return
    }

    setIsUploading(true)
    setFileName(file.name)

    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/import/csv", {
        method: "POST",
        body: formData,
      })

      if (res.status === 401) {
        toast.error("Please sign in to import files")
        setIsUploading(false)
        return
      }

      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error || "Failed to upload file")
        setIsUploading(false)
        return
      }

      const data = (await res.json()) as ImportPreview
      setBatchId(data.batchId)
      setHeaders(data.headers)
      setRows(data.rows)
      setTotalRows(data.totalRows)
      setStep("mapping")

      // Auto-map by guessing column names
      const autoMap: Record<string, string> = {}
      for (const field of REQUIRED_FIELDS) {
        const match = data.headers.find((h) =>
          h.toLowerCase().includes(field.key.toLowerCase())
        )
        if (match) autoMap[field.key] = match
      }
      setMapping(autoMap)
    } catch {
      toast.error("Network error. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragActive(false)
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragActive(true)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDragActive(false)
  }, [])

  const isMappingValid = REQUIRED_FIELDS
    .filter((f) => f.required)
    .every((f) => mapping[f.key])

  const handleImport = async () => {
    if (!batchId) {
      toast.error("No import batch found. Please upload a file first.")
      return
    }

    setStep("importing")

    try {
      const columnMap: ColumnMapping = {
        title: mapping.title,
        author: mapping.author,
        rating: mapping.rating,
        isbn: mapping.isbn,
        date: mapping.date,
        tags: mapping.tags,
      }

      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId, columnMap }),
      })

      if (res.status === 401) {
        toast.error("Please sign in to import files")
        setStep("preview")
        return
      }

      if (res.status === 404) {
        toast.error("Import batch not found or already processed")
        setStep("upload")
        return
      }

      if (!res.ok) {
        const { error } = await res.json()
        toast.error(error || "Failed to import data")
        setStep("preview")
        return
      }

      const { stats } = (await res.json()) as { success: boolean; stats: ImportStats }
      setImportStats(stats)
      setStep("done")
    } catch {
      toast.error("Network error. Please try again.")
      setStep("preview")
    }
  }

  const reset = () => {
    setStep("upload")
    setIsUploading(false)
    setBatchId(null)
    setFileName("")
    setHeaders([])
    setRows([])
    setTotalRows(0)
    setMapping({})
    setImportStats(null)
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 px-4 py-24 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-foreground">
          Sign In Required
        </h1>
        <p className="max-w-md text-muted-foreground">
          You need to be signed in to import your reading history.
        </p>
        <Button asChild>
          <Link href="/login">Sign In</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:py-12">
      <div className="mb-10 text-center">
        <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
          Import Reading History
        </h1>
        <p className="mt-3 text-muted-foreground">
          Upload your CSV to improve rating predictions
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-10">
        <div className="flex items-center justify-between">
          {(["Upload", "Map Columns", "Preview", "Import"] as const).map(
            (label, i) => {
              const stepOrder = ["upload", "mapping", "preview", "importing"]
              const currentIndex = stepOrder.indexOf(
                step === "done" ? "importing" : step
              )
              const isDone = i < currentIndex || step === "done"
              const isActive = i === currentIndex
              return (
                <div key={label} className="flex flex-1 flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                      isDone
                        ? "bg-primary text-primary-foreground"
                        : isActive
                          ? "border-2 border-primary bg-background text-primary"
                          : "border border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {isDone ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      i + 1
                    )}
                  </div>
                  <span
                    className={`mt-2 text-xs font-medium ${
                      isDone || isActive
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {label}
                  </span>
                </div>
              )
            }
          )}
        </div>
      </div>

      {/* Step: Upload */}
      {step === "upload" && (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-12 text-center transition-colors ${
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border bg-card"
          }`}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <div>
                <p className="font-semibold text-foreground">
                  Uploading {fileName}...
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Please wait while we process your file
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Upload className="h-8 w-8 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">
                  Drop your CSV file here
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  or click to browse your files
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleFile(file)
                }}
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                Browse Files
              </Button>
              <p className="text-xs text-muted-foreground">
                Supports .csv files exported from Goodreads, StoryGraph, and more
              </p>
            </>
          )}
        </div>
      )}

      {/* Step: Column Mapping */}
      {step === "mapping" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Map Your Columns
              </h2>
              <p className="text-sm text-muted-foreground">
                Match your CSV columns to the fields we need. File: {fileName}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {REQUIRED_FIELDS.map((field) => (
              <div
                key={field.key}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
              >
                <Label className="w-32 flex-shrink-0 text-sm">
                  {field.label}
                  {field.required && (
                    <span className="ml-1 text-destructive">*</span>
                  )}
                </Label>
                <Select
                  value={mapping[field.key] || ""}
                  onValueChange={(v) =>
                    setMapping((prev) => ({ ...prev, [field.key]: v }))
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select a column..." />
                  </SelectTrigger>
                  <SelectContent>
                    {headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {mapping[field.key] && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setMapping((prev) => {
                        const next = { ...prev }
                        delete next[field.key]
                        return next
                      })
                    }
                    aria-label={`Clear ${field.label} mapping`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="mt-8 flex justify-between">
            <Button variant="outline" onClick={reset} className="gap-2 bg-transparent">
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              onClick={() => setStep("preview")}
              disabled={!isMappingValid}
              className="gap-2"
            >
              Preview Data
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-6">
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Preview Your Data
            </h2>
            <p className="text-sm text-muted-foreground">
              Showing the first {Math.min(5, rows.length)} of {totalRows}{" "}
              rows
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {REQUIRED_FIELDS.filter(
                    (f) => mapping[f.key]
                  ).map((field) => (
                    <th
                      key={field.key}
                      className="px-4 py-3 text-left font-medium text-foreground"
                    >
                      {field.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((row, ri) => (
                  <tr
                    key={ri}
                    className="border-b border-border last:border-0"
                  >
                    {REQUIRED_FIELDS.filter(
                      (f) => mapping[f.key]
                    ).map((field) => {
                      const colIndex = headers.indexOf(mapping[field.key])
                      return (
                        <td
                          key={field.key}
                          className="px-4 py-3 text-muted-foreground"
                        >
                          {colIndex >= 0 ? row[colIndex] || "—" : "—"}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-8 flex justify-between">
            <Button
              variant="outline"
              onClick={() => setStep("mapping")}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleImport} className="gap-2">
              <Upload className="h-4 w-4" />
              Import {totalRows} Books
            </Button>
          </div>
        </div>
      )}

      {/* Step: Importing */}
      {step === "importing" && (
        <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-12 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <div>
            <h2 className="font-serif text-lg font-semibold text-foreground">
              Importing your books...
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Processing {totalRows} books. This may take a moment.
            </p>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && importStats && (
        <div className="flex flex-col items-center gap-6 rounded-xl border border-border bg-card p-8 text-center md:p-12">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-foreground">
              Import Complete
            </h2>
            <p className="mt-2 text-muted-foreground">
              Your reading history has been imported successfully
            </p>
          </div>

          <div className="grid w-full max-w-sm grid-cols-2 gap-4">
            <StatBox label="Total Rows" value={importStats.total} />
            <StatBox label="Imported" value={importStats.imported} variant="success" />
            <StatBox label="Skipped" value={importStats.skipped} variant="warning" />
            <StatBox label="Errors" value={importStats.errors} variant="error" />
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/search">Search Books</Link>
            </Button>
            <Button variant="outline" onClick={reset}>
              Import More
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({
  label,
  value,
  variant = "default",
}: {
  label: string
  value: number
  variant?: "default" | "success" | "warning" | "error"
}) {
  const colors = {
    default: "text-foreground",
    success: "text-accent",
    warning: "text-primary",
    error: "text-destructive",
  }

  return (
    <div className="flex flex-col items-center rounded-lg border border-border bg-background p-4">
      <span className={`text-2xl font-bold tabular-nums ${colors[variant]}`}>
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
