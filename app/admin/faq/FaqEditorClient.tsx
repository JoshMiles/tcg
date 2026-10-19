'use client';

import { useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/app/components/Icon';
import {
  DEFAULT_FAQ_SECTIONS,
  parseFaqAnswerBlocks,
  parseInlineTokens,
  QUESTION_ANSWER_MAX,
  QUESTION_TITLE_MAX,
  SECTION_TITLE_MAX,
  type FaqQuestion,
  type FaqSectionMeta,
  type FaqStoreData,
} from '@/lib/faq-core';
import { ArmedButton } from '../components/ArmedButton';
import {
  Chip,
  EmptyState,
  Panel,
  areaClass,
  fieldClass,
  selectClass,
} from '../components/ui';
import {
  createFaqQuestionAction,
  createFaqSectionAction,
  deleteFaqQuestionAction,
  deleteFaqSectionAction,
  reorderFaqQuestionsAction,
  reorderFaqSectionsAction,
  resetFaqAction,
  toggleFaqSectionAction,
  updateFaqQuestionAction,
} from '../faq-actions';

const SECTION_ICON_OPTIONS: IconName[] = [
  'help', 'cheese', 'cards', 'trade', 'sparkles', 'user', 'tv', 'trophy',
  'calendar', 'puzzle', 'lock', 'wrench', 'chat', 'star', 'coins', 'gift',
  'shield', 'info', 'book', 'bell', 'heart', 'gem', 'activity',
];

interface QuestionFormData {
  sectionId: string;
  question: string;
  answer: string;
  enabled: boolean;
}

const EMPTY_QUESTION_FORM: QuestionFormData = {
  sectionId: 'start',
  question: '',
  answer: '',
  enabled: true,
};

function AnswerPreview({ answer }: { answer: string }) {
  const blocks = parseFaqAnswerBlocks(answer);
  if (!blocks.length) {
    return <p className="text-gray-500 italic text-xs">Preview will appear here...</p>;
  }

  return (
    <div className="space-y-2 text-xs text-gray-300 leading-relaxed">
      {blocks.map((block, i) => {
        if (block.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-4 space-y-1 marker:text-gray-600">
              {block.items.map((item, j) => (
                <li key={j}>{renderTokens(item)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{renderTokens(block.text)}</p>;
      })}
    </div>
  );
}

function renderTokens(text: string): ReactNode {
  const tokens = parseInlineTokens(text);
  return tokens.map((t, idx) => {
    if (t.type === 'bold') {
      return <strong key={idx} className="text-white font-semibold">{t.content}</strong>;
    }
    if (t.type === 'link') {
      return (
        <a
          key={idx}
          href={t.href}
          target={t.href.startsWith('http') ? '_blank' : undefined}
          rel={t.href.startsWith('http') ? 'noopener noreferrer' : undefined}
          className="text-yellow-400 hover:text-yellow-300 underline"
        >
          {t.content}
        </a>
      );
    }
    return t.content;
  });
}

export function FaqEditorClient({ store }: { store: FaqStoreData }) {
  const [activeTab, setActiveTab] = useState<'questions' | 'sections'>('questions');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  // Question editing modal state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuestionFormData>(EMPTY_QUESTION_FORM);

  // New section modal state
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [newSectionId, setNewSectionId] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionIcon, setNewSectionIcon] = useState<IconName>('help');

  function openCreateQuestion(defaultSectionId?: string) {
    setEditingQuestionId(null);
    setQuestionForm({
      ...EMPTY_QUESTION_FORM,
      sectionId: defaultSectionId || store.sections[0]?.id || 'start',
    });
    setError('');
    setIsQuestionModalOpen(true);
  }

  function openEditQuestion(q: FaqQuestion) {
    setEditingQuestionId(q.id);
    setQuestionForm({
      sectionId: q.sectionId,
      question: q.question,
      answer: q.answer,
      enabled: q.enabled !== false,
    });
    setError('');
    setIsQuestionModalOpen(true);
  }

  function handleSaveQuestion() {
    setError('');
    setNotice('');
    startTransition(async () => {
      const payload = {
        sectionId: questionForm.sectionId,
        question: questionForm.question,
        answer: questionForm.answer,
        enabled: questionForm.enabled,
      };

      const res = editingQuestionId
        ? await updateFaqQuestionAction(editingQuestionId, payload)
        : await createFaqQuestionAction(payload);

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setNotice(editingQuestionId ? 'Question updated.' : 'Question created.');
      setIsQuestionModalOpen(false);
    });
  }

  function handleDeleteQuestion(id: string) {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await deleteFaqQuestionAction(id);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('Question deleted.');
    });
  }

  function handleMoveQuestion(sectionId: string, questionId: string, direction: 'up' | 'down') {
    const sectionQuestions = store.questions.filter(q => q.sectionId === sectionId);
    const index = sectionQuestions.findIndex(q => q.id === questionId);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectionQuestions.length) return;

    const newOrder = [...sectionQuestions];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    startTransition(async () => {
      const res = await reorderFaqQuestionsAction(sectionId, newOrder.map(q => q.id));
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('Questions reordered.');
    });
  }

  function handleMoveSection(sectionId: string, direction: 'up' | 'down') {
    const index = store.sections.findIndex(s => s.id === sectionId);
    if (index < 0) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= store.sections.length) return;

    const newOrder = [...store.sections];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, moved);

    startTransition(async () => {
      const res = await reorderFaqSectionsAction(newOrder.map(s => s.id));
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('Section blocks reordered.');
    });
  }

  function handleToggleSectionVisibility(sectionId: string, currentHidden?: boolean) {
    startTransition(async () => {
      const res = await toggleFaqSectionAction(sectionId, !currentHidden);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice(!currentHidden ? 'Section hidden from site.' : 'Section visible on site.');
    });
  }

  function handleCreateSection() {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await createFaqSectionAction({
        id: newSectionId,
        title: newSectionTitle,
        icon: newSectionIcon,
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('Section block created.');
      setIsSectionModalOpen(false);
      setNewSectionId('');
      setNewSectionTitle('');
    });
  }

  function handleDeleteSection(sectionId: string) {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await deleteFaqSectionAction(sectionId);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('Section deleted.');
    });
  }

  function handleResetFaq() {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await resetFaqAction();
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setNotice('FAQ reset to defaults.');
    });
  }

  // Filtered questions
  const filteredQuestions = store.questions.filter(q => {
    if (selectedSectionFilter !== 'all' && q.sectionId !== selectedSectionFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase();
      return (
        q.question.toLowerCase().includes(term) ||
        q.answer.toLowerCase().includes(term) ||
        q.sectionId.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Alert Notices */}
      {error && (
        <div className="alert alert-error text-sm py-2">
          <Icon name="alert" />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} className="btn btn-ghost btn-xs">✕</button>
        </div>
      )}
      {notice && (
        <div className="alert alert-success text-sm py-2">
          <Icon name="check" />
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} className="btn btn-ghost btn-xs">✕</button>
        </div>
      )}

      {/* Navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('questions')}
            className={`btn btn-sm ${activeTab === 'questions' ? 'btn-primary' : 'btn-ghost text-gray-400'}`}
          >
            <Icon name="help" className="mr-1" /> Questions ({store.questions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sections')}
            className={`btn btn-sm ${activeTab === 'sections' ? 'btn-primary' : 'btn-ghost text-gray-400'}`}
          >
            <Icon name="list" className="mr-1" /> Section blocks ({store.sections.length})
          </button>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'questions' ? (
            <button
              type="button"
              onClick={() => openCreateQuestion()}
              className="btn btn-sm btn-primary"
            >
              <Icon name="plus" className="mr-1" /> Add question
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsSectionModalOpen(true)}
              className="btn btn-sm btn-primary"
            >
              <Icon name="plus" className="mr-1" /> New section
            </button>
          )}
        </div>
      </div>

      {/* ── TAB 1: QUESTIONS ── */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search questions or answers..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="w-auto min-w-[180px]">
              <select
                value={selectedSectionFilter}
                onChange={e => setSelectedSectionFilter(e.target.value)}
                className={selectClass}
              >
                <option value="all">All sections ({store.questions.length})</option>
                {store.sections.map(s => {
                  const count = store.questions.filter(q => q.sectionId === s.id).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.title} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Section grouped view */}
          {store.sections
            .filter(s => selectedSectionFilter === 'all' || s.id === selectedSectionFilter)
            .map(section => {
              const sectionQuestions = filteredQuestions.filter(q => q.sectionId === section.id);
              if (selectedSectionFilter === 'all' && searchQuery && sectionQuestions.length === 0) {
                return null;
              }

              return (
                <Panel
                  key={section.id}
                  title={
                    <span className="flex items-center gap-2">
                      <Icon name={section.icon} className="text-yellow-400" />
                      <span>{section.title}</span>
                      <span className="text-xs text-gray-500 font-mono">#{section.id}</span>
                      {section.hidden && <Chip tone="amber">Hidden on site</Chip>}
                    </span>
                  }
                  actions={
                    <button
                      type="button"
                      onClick={() => openCreateQuestion(section.id)}
                      className="btn btn-xs btn-outline"
                    >
                      <Icon name="plus" className="mr-1" /> Add question
                    </button>
                  }
                >
                  {section.builtin && (
                    <div className="text-xs text-gray-500 bg-gray-900/50 rounded-lg p-2.5 border border-gray-800/80 mb-2">
                      <span className="text-gray-400 font-medium">Built-in section:</span> contains standard questions in code. Custom questions added here render directly alongside them on the live page.
                    </div>
                  )}

                  {sectionQuestions.length === 0 ? (
                    <div className="py-4 text-center text-xs text-gray-500 italic">
                      No custom questions in this section yet.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sectionQuestions.map((q, idx) => (
                        <div
                          key={q.id}
                          className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 rounded-xl bg-gray-900/80 border border-gray-800 hover:border-gray-700 transition-colors"
                        >
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white text-sm">{q.question}</span>
                              {!q.enabled && <Chip tone="amber">Inactive</Chip>}
                            </div>
                            <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">
                              {q.answer}
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center gap-1 self-end sm:self-center">
                            <button
                              type="button"
                              disabled={pending || idx === 0}
                              onClick={() => handleMoveQuestion(section.id, q.id, 'up')}
                              title="Move up"
                              className="btn btn-ghost btn-xs text-gray-400 hover:text-white"
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={pending || idx === sectionQuestions.length - 1}
                              onClick={() => handleMoveQuestion(section.id, q.id, 'down')}
                              title="Move down"
                              className="btn btn-ghost btn-xs text-gray-400 hover:text-white"
                            >
                              ▼
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => openEditQuestion(q)}
                              className="btn btn-ghost btn-xs text-yellow-400 hover:text-yellow-300"
                            >
                              <Icon name="pencil" /> Edit
                            </button>
                            <ArmedButton
                              disabled={pending}
                              onConfirm={() => handleDeleteQuestion(q.id)}
                              className="btn btn-ghost btn-xs text-red-400 hover:text-red-300"
                              title="Delete question"
                            >
                              <Icon name="trash" />
                            </ArmedButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Panel>
              );
            })}
        </div>
      )}

      {/* ── TAB 2: SECTION BLOCKS ── */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Reorder section blocks to change how they appear on the public FAQ page and top navigation pills. Use the arrows to move blocks up or down.
          </p>

          <div className="space-y-2">
            {store.sections.map((sec, idx) => {
              const customCount = store.questions.filter(q => q.sectionId === sec.id).length;
              const isBuiltin = sec.builtin !== false && DEFAULT_FAQ_SECTIONS.some(d => d.id === sec.id);

              return (
                <div
                  key={sec.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-gray-900/80 border border-gray-800"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xs font-mono text-gray-500 w-6 tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <Icon name={sec.icon} className="w-4 h-4 text-yellow-400" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white text-sm">{sec.title}</span>
                        <span className="text-xs text-gray-500 font-mono">#{sec.id}</span>
                        {isBuiltin ? (
                          <Chip tone="gray">Built-in</Chip>
                        ) : (
                          <Chip tone="purple">Custom</Chip>
                        )}
                        {sec.hidden && <Chip tone="amber">Hidden</Chip>}
                      </div>
                      <p className="text-xs text-gray-500">
                        {customCount} custom question{customCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={pending || idx === 0}
                      onClick={() => handleMoveSection(sec.id, 'up')}
                      title="Move block up"
                      className="btn btn-ghost btn-sm text-gray-400 hover:text-white"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={pending || idx === store.sections.length - 1}
                      onClick={() => handleMoveSection(sec.id, 'down')}
                      title="Move block down"
                      className="btn btn-ghost btn-sm text-gray-400 hover:text-white"
                    >
                      ▼
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => handleToggleSectionVisibility(sec.id, sec.hidden)}
                      className={`btn btn-sm ${sec.hidden ? 'btn-warning btn-outline' : 'btn-ghost text-gray-300'}`}
                      title={sec.hidden ? 'Show section' : 'Hide section'}
                    >
                      <Icon name={sec.hidden ? 'eye' : 'eye'} className="mr-1" />
                      {sec.hidden ? 'Show' : 'Hide'}
                    </button>

                    {!isBuiltin && (
                      <ArmedButton
                        disabled={pending || customCount > 0}
                        onConfirm={() => handleDeleteSection(sec.id)}
                        className="btn btn-ghost btn-sm text-red-400 hover:text-red-300"
                        title={customCount > 0 ? 'Cannot delete section with questions' : 'Delete custom section'}
                      >
                        <Icon name="trash" />
                      </ArmedButton>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── QUESTION MODAL ── */}
      {isQuestionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="card rounded-2xl bg-gray-900 border border-gray-800 p-6 max-w-2xl w-full space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="help" className="text-yellow-400" />
                {editingQuestionId ? 'Edit Question' : 'Add Question'}
              </h3>
              <button
                type="button"
                onClick={() => setIsQuestionModalOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">Target section</label>
                <select
                  value={questionForm.sectionId}
                  onChange={e => setQuestionForm(prev => ({ ...prev, sectionId: e.target.value }))}
                  className={selectClass}
                >
                  {store.sections.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title} (#{s.id})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">
                  Question title ({questionForm.question.length}/{QUESTION_TITLE_MAX})
                </label>
                <input
                  type="text"
                  placeholder="e.g. Can I participate without a Twitch account?"
                  value={questionForm.question}
                  onChange={e => setQuestionForm(prev => ({ ...prev, question: e.target.value }))}
                  maxLength={QUESTION_TITLE_MAX}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">
                  Answer ({questionForm.answer.length}/{QUESTION_ANSWER_MAX})
                </label>
                <p className="text-[11px] text-gray-500 mb-2">
                  Supports paragraphs, bullet lists (<code className="text-yellow-400">- item</code>), bold (<code className="text-yellow-400">**bold**</code>), and links (<code className="text-yellow-400">[label](url)</code>).
                </p>
                <textarea
                  rows={6}
                  placeholder="Write the full answer here..."
                  value={questionForm.answer}
                  onChange={e => setQuestionForm(prev => ({ ...prev, answer: e.target.value }))}
                  maxLength={QUESTION_ANSWER_MAX}
                  className={areaClass}
                />
              </div>

              {/* Answer Preview Box */}
              <div className="rounded-xl border border-gray-800 bg-black/40 p-3 space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold block">
                  Live Preview
                </span>
                <AnswerPreview answer={questionForm.answer} />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="enabled-toggle"
                  checked={questionForm.enabled}
                  onChange={e => setQuestionForm(prev => ({ ...prev, enabled: e.target.checked }))}
                  className="checkbox checkbox-sm checkbox-primary"
                />
                <label htmlFor="enabled-toggle" className="text-sm text-gray-300 cursor-pointer">
                  Visible and published on the live FAQ
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setIsQuestionModalOpen(false)}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !questionForm.question.trim() || !questionForm.answer.trim()}
                onClick={handleSaveQuestion}
                className="btn btn-sm btn-primary"
              >
                {pending ? 'Saving...' : 'Save Question'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CREATE SECTION MODAL ── */}
      {isSectionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="card rounded-2xl bg-gray-900 border border-gray-800 p-6 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="plus" className="text-yellow-400" />
                New Section Block
              </h3>
              <button
                type="button"
                onClick={() => setIsSectionModalOpen(false)}
                className="btn btn-ghost btn-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">
                  Identifier (slug, lowercase)
                </label>
                <input
                  type="text"
                  placeholder="e.g. tournaments"
                  value={newSectionId}
                  onChange={e => setNewSectionId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">
                  Title ({newSectionTitle.length}/{SECTION_TITLE_MAX})
                </label>
                <input
                  type="text"
                  placeholder="e.g. Tournaments & Events"
                  value={newSectionTitle}
                  onChange={e => setNewSectionTitle(e.target.value)}
                  maxLength={SECTION_TITLE_MAX}
                  className={fieldClass}
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-400 mb-1 block">Icon</label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-black/40 rounded-xl border border-gray-800 max-h-36 overflow-y-auto">
                  {SECTION_ICON_OPTIONS.map(iconName => (
                    <button
                      key={iconName}
                      type="button"
                      onClick={() => setNewSectionIcon(iconName)}
                      className={`btn btn-xs ${newSectionIcon === iconName ? 'btn-primary' : 'btn-ghost text-gray-400'}`}
                      title={iconName}
                    >
                      <Icon name={iconName} />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => setIsSectionModalOpen(false)}
                className="btn btn-sm btn-ghost"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || !newSectionId.trim() || !newSectionTitle.trim()}
                onClick={handleCreateSection}
                className="btn btn-sm btn-primary"
              >
                {pending ? 'Creating...' : 'Create Section'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FOOTER ACTIONS ── */}
      <div className="pt-6 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <div>
          <span>Need to restore initial state? </span>
          <ArmedButton
            disabled={pending}
            onConfirm={handleResetFaq}
            armedLabel="Sure? Clears custom FAQ"
            className="btn btn-ghost btn-xs text-gray-400 hover:text-red-400"
          >
            Reset FAQ to defaults
          </ArmedButton>
        </div>
        <Link href="/faq" target="_blank" className="hover:text-yellow-400 flex items-center gap-1">
          Open live FAQ <Icon name="external" />
        </Link>
      </div>
    </div>
  );
}
