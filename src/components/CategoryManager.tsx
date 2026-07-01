"use client";

import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { getCategoryLabel, getFallbackCategoryId, sortCategoriesByLabel } from "@/lib/categories";
import { t } from "@/lib/i18n";
import { SettingsAccordion } from "@/components/SettingsAccordion";
import { cn } from "@/lib/utils";

const keywordsFieldClass = cn(
  "flex min-h-[7rem] max-h-52 w-full resize-y overflow-y-auto rounded-md border border-input",
  "bg-background px-3 py-2 text-sm leading-relaxed ring-offset-background",
  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
);

function parseKeywordsInput(raw: string): string[] {
  return raw
    .split(/[,\n]+/)
    .map((k) => k.trim().toLowerCase())
    .filter(Boolean);
}
import { useCategories, useStore } from "@/store/useStore";
import type { TxType } from "@/types";

function replaceTokens(template: string, tokens: Record<string, string>): string {
  let s = template;
  for (const [key, value] of Object.entries(tokens)) {
    s = s.split(`{${key}}`).join(value);
  }
  return s;
}

export function CategoryManager() {
  const locale = useStore((s) => s.locale);
  const categories = useCategories();
  const addCategory = useStore((s) => s.addCategory);
  const updateCategory = useStore((s) => s.updateCategory);
  const removeCategory = useStore((s) => s.removeCategory);
  const restoreDefaultCategories = useStore((s) => s.restoreDefaultCategories);
  const { toast } = useToast();

  const [tab, setTab] = useState<TxType>("expense");
  const [newName, setNewName] = useState("");
  const [newKeywords, setNewKeywords] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [editRu, setEditRu] = useState("");
  const [editEn, setEditEn] = useState("");
  const [editKeywords, setEditKeywords] = useState("");

  const list = useMemo(
    () => sortCategoriesByLabel(categories.filter((c) => c.type === tab), categories, locale),
    [categories, tab, locale],
  );

  const handleAdd = () => {
    const name = newName.trim();
    if (!name) return;
    const kw = parseKeywordsInput(newKeywords);
    addCategory(tab, name, name, kw);
    setNewName("");
    setNewKeywords("");
  };

  const startEdit = (id: string) => {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    setPendingDeleteId(null);
    setEditingId(id);
    setExpandedId(id);
    setEditRu(cat.labels?.ru ?? "");
    setEditEn(cat.labels?.en ?? "");
    setEditKeywords((cat.keywords ?? []).join("\n"));
  };

  const toggleCategory = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setEditingId(null);
      setPendingDeleteId(null);
      return;
    }
    startEdit(id);
  };

  const saveEdit = () => {
    if (!editingId) return;
    updateCategory(editingId, {
      labels: { ru: editRu.trim() || editEn.trim(), en: editEn.trim() || editRu.trim() },
      keywords: parseKeywordsInput(editKeywords),
    });
    setEditingId(null);
    setExpandedId(null);
  };

  const requestDelete = (id: string) => {
    setEditingId(null);
    setExpandedId(id);
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    if (cat.id === getFallbackCategoryId(cat.type)) {
      toast(t(locale, "categoryDeleteBlocked"), "error");
      return;
    }
    setPendingDeleteId(id);
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) return;
    const ok = removeCategory(pendingDeleteId);
    if (!ok) {
      toast(t(locale, "categoryDeleteBlocked"), "error");
      setPendingDeleteId(null);
      return;
    }
    setPendingDeleteId(null);
  };

  const handleRestoreDefaults = () => {
    restoreDefaultCategories();
    setPendingDeleteId(null);
    setEditingId(null);
    toast(t(locale, "categoryRestored"), "success");
  };

  const pendingCat = pendingDeleteId
    ? categories.find((c) => c.id === pendingDeleteId)
    : undefined;

  return (
    <div className="space-y-3">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as TxType);
          setPendingDeleteId(null);
          setEditingId(null);
          setExpandedId(null);
        }}
      >
        <TabsList className="w-full">
          <TabsTrigger value="expense" className="flex-1">
            {t(locale, "filterExpense")}
          </TabsTrigger>
          <TabsTrigger value="income" className="flex-1">
            {t(locale, "filterIncome")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value={tab} className="mt-3 space-y-2">
          <ul className="max-h-[min(50vh,20rem)] space-y-1.5 overflow-y-auto">
            {list.map((cat) => {
              const canDelete = cat.id !== getFallbackCategoryId(cat.type);
              const isPending = pendingDeleteId === cat.id;
              const isExpanded = expandedId === cat.id && !isPending;

              return (
                <li
                  key={cat.id}
                  className="overflow-hidden rounded-md border text-sm"
                >
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/40"
                    aria-expanded={isExpanded || isPending}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {getCategoryLabel(cat.id, categories, locale)}
                      {cat.isSystem ? (
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          ({t(locale, "categorySystem")})
                        </span>
                      ) : null}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        (isExpanded || isPending) && "rotate-180",
                      )}
                      aria-hidden
                    />
                  </button>

                  {isPending && pendingCat && (
                    <div className="space-y-2 border-t border-destructive/20 px-3 pb-3 pt-2">
                      <p className="text-xs text-muted-foreground">
                        {replaceTokens(t(locale, "categoryDeleteConfirm"), {
                          name: getCategoryLabel(cat.id, categories, locale),
                          fallback: getCategoryLabel(
                            getFallbackCategoryId(cat.type),
                            categories,
                            locale,
                          ),
                        })}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="flex-1"
                          onClick={confirmDelete}
                        >
                          {t(locale, "categoryDeleteYes")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => setPendingDeleteId(null)}
                        >
                          {t(locale, "cancel")}
                        </Button>
                      </div>
                    </div>
                  )}

                  {isExpanded && editingId === cat.id ? (
                    <div className="space-y-2 border-t bg-muted/20 px-3 pb-3 pt-2">
                      <Input
                        value={editRu}
                        onChange={(e) => setEditRu(e.target.value)}
                        placeholder={t(locale, "categoryNameRu")}
                      />
                      <Input
                        value={editEn}
                        onChange={(e) => setEditEn(e.target.value)}
                        placeholder={t(locale, "categoryNameEn")}
                      />
                      <textarea
                        value={editKeywords}
                        onChange={(e) => setEditKeywords(e.target.value)}
                        placeholder={t(locale, "categoryKeywords")}
                        className={keywordsFieldClass}
                        rows={5}
                        spellCheck={false}
                      />
                      <div className="flex gap-2">
                        <Button type="button" size="sm" className="flex-1" onClick={saveEdit}>
                          {t(locale, "confirm")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setEditingId(null);
                            setExpandedId(null);
                          }}
                        >
                          {t(locale, "cancel")}
                        </Button>
                      </div>
                      {canDelete ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="w-full text-destructive"
                          onClick={() => requestDelete(cat.id)}
                        >
                          <Trash2 className="mr-1 h-3.5 w-3.5" />
                          {t(locale, "categoryDelete")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <SettingsAccordion title={t(locale, "categoryAdd")}>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t(locale, "categoryNameRu")}
            />
            <textarea
              value={newKeywords}
              onChange={(e) => setNewKeywords(e.target.value)}
              placeholder={t(locale, "categoryKeywords")}
              className={keywordsFieldClass}
              rows={5}
              spellCheck={false}
            />
            <Button
              type="button"
              className="w-full"
              variant="secondary"
              onClick={handleAdd}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t(locale, "categoryAddSubmit")}
            </Button>
          </SettingsAccordion>
        </TabsContent>
      </Tabs>

      <Button
        type="button"
        variant="outline"
        className="w-full text-xs"
        onClick={handleRestoreDefaults}
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        {t(locale, "categoryRestoreDefaults")}
      </Button>
    </div>
  );
}
