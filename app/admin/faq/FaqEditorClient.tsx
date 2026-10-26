'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Icon, type IconName } from '@/app/components/Icon';
import {
  DEFAULT_FAQ_SECTIONS,
  FAQ_BLOCK_NAMES,
  findFaqProblems,
  QUESTION_ANSWER_MAX,
  QUESTION_TITLE_MAX,
  SECTION_TITLE_MAX,
  type FaqQuestion,
  type FaqStoreData,
  type FaqValues,
} from '@/lib/faq-core';
import { FAQ_BUILTINS, type FaqBuiltin } from '@/lib/faq-builtins';
import { FaqAnswer } from '@/app/(site)/faq/parts';
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
  resetFaqBuiltinAction,
  saveFaqBuiltinAction,
  setFaqBuiltinHiddenAction,
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

function AnswerPreview({ answer, values }: { answer: string; values: FaqValues }) {
  if (!answer.trim()) {
    return <p className="text-gray-500 italic text-xs">Preview will appear here...</p>;
  }
  return (
    <div className="text-xs text-gray-300 leading-relaxed">
      <FaqAnswer
        answer={answer}
        values={values}
        renderBlock={name => <span className="inline-block rounded bg-gray-800 px-2 py-0.5 text-gray-400">Live block: {name}</span>}
      />
    </div>
  );
}

export function FaqEditorClient({ store, values }: { store: FaqStoreData; values: FaqValues }) {
  const [activeTab, setActiveTab] = useState<'questions' | 'sections'>('questions');
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, startTransition] = useTransition();

  // Question editing modal state
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editingBuiltin, setEditingBuiltin] = useState<FaqBuiltin | null>(null);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionForm, setQuestionForm] = useState<QuestionFormData>(EMPTY_QUESTION_FORM);

  // New section modal state
  const [isSectionModalOpen, setIsSectionModalOpen] = useState(false);
  const [newSectionId, setNewSectionId] = useState('');
  const [newSectionTitle, setNewSectionTitle] = useState('');
  const [newSectionIcon, setNewSectionIcon] = useState<IconName>('help');

  // Everything the section lists: its custom questions plus its built-ins (hidden ones included).
  function sectionCount(sectionId: string) {
    return store.questions.filter(q => q.sectionId === sectionId).length + FAQ_BUILTINS.filter(b => b.sectionId === sectionId).length;
  }

  function openCreateQuestion(defaultSectionId?: string) {
    setEditingQuestionId(null);
    setEditingBuiltin(null);
    setQuestionForm({
      ...EMPTY_QUESTION_FORM,
      sectionId: defaultSectionId || store.sections[0]?.id || 'start',
    });
    setError('');
    setIsQuestionModalOpen(true);
  }

  function openEditBuiltin(b: FaqBuiltin) {
    const o = store.overrides[b.id];
    setEditingQuestionId(null);
    setEditingBuiltin(b);
    setQuestionForm({ sectionId: b.sectionId, question: o?.question ?? b.question, answer: o?.answer ?? b.answer, enabled: true });
    setError('');
    setIsQuestionModalOpen(true);
  }

  function runBuiltin(run: () => Promise<{ ok: boolean; message?: string }>, done: string) {
    setError('');
    setNotice('');
    startTransition(async () => {
      const res = await run();
      if (!res.ok) {
        setError(res.message ?? 'Something went wrong.');
        return;
      }
      setNotice(done);
    });
  }

  function openEditQuestion(q: FaqQuestion) {
    setEditingBuiltin(null);
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

      const res = editingBuiltin
        ? await saveFaqBuiltinAction(editingBuiltin.id, { question: payload.question, answer: payload.answer })
        : editingQuestionId
          ? await updateFaqQuestionAction(editingQuestionId, payload)
          : await createFaqQuestionAction(payload);

      if (!res.ok) {
        setError(res.message);
        return;
      }

      setNotice(editingBuiltin || editingQuestionId ?'Question updated.' : 'Question created.');
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
            <Icon name="help" className="mr-1" /> Questions ({store.sections.reduce((n, s) => n + sectionCount(s.id), 0)})
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
                <option value="all">All sections ({store.sections.reduce((n, s) => n + sectionCount(s.id), 0)})</option>
                {store.sections.map(s => {
                  return (
                    <option key={s.id} value={s.id}>
                      {s.title} ({sectionCount(s.id)})
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
              const term = searchQuery.trim().toLowerCase();
              const sectionBuiltins = FAQ_BUILTINS.filter(b => {
                if (b.sectionId !== section.id) return false;
                if (!term) return true;
                const o = store.overrides[b.id];
                return `${o?.question ?? b.question} ${o?.answer ?? b.answer} ${b.id}`.toLowerCase().includes(term);
              });
              if (selectedSectionFilter === 'all' && searchQuery && sectionQuestions.length === 0 && sectionBuiltins.length === 0) {
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
                  {sectionBuiltins.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {sectionBuiltins.map(b => {
                        const o = store.overrides[b.id];
                        const edited = !!(o?.question || o?.answer);
                        const problems = findFaqProblems(o?.answer ?? b.answer, values);
                        return (
                          <div key={b.id} className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 p-3 rounded-xl bg-gray-900/50 border border-gray-800">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-white text-sm">{o?.question ?? b.question}</span>
                                <Chip tone="gray">Built-in</Chip>
                                {edited && <Chip tone="purple">Edited</Chip>}
                                {o?.hidden && <Chip tone="amber">Hidden</Chip>}
                                {b.when && <Chip tone="gray">{b.when === 'no_upgrades' ? 'Only without upgrades' : b.when === 'upgrades' ? 'Only with upgrades' : 'Only with card values'}</Chip>}
                                {problems.placeholders.length + problems.blocks.length > 0 && <Chip tone="amber">Unknown placeholder</Chip>}
                                <span className="text-xs text-gray-500 font-mono">#{b.id}</span>
                              </div>
                              <p className="text-xs text-gray-400 line-clamp-2 leading-relaxed">{o?.answer ?? b.answer}</p>
                            </div>
                            <div className="shrink-0 flex items-center gap-1 self-end sm:self-center">
                              <button type="button" disabled={pending} onClick={() => openEditBuiltin(b)} className="btn btn-ghost btn-xs text-yellow-400 hover:text-yellow-300">
                                <Icon name="pencil" /> Edit
                              </button>
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => runBuiltin(() => setFaqBuiltinHiddenAction(b.id, !o?.hidden), o?.hidden ? 'Question shown.' : 'Question hidden.')}
                                className="btn btn-ghost btn-xs text-gray-300"
                              >
                                <Icon name="eye" /> {o?.hidden ? 'Show' : 'Hide'}
                              </button>
                              {edited && (
                                <ArmedButton
                                  disabled={pending}
                                  onConfirm={() => runBuiltin(() => resetFaqBuiltinAction(b.id), 'Question reset to the built-in text.')}
                                  armedLabel="Sure?"
                                  className="btn btn-ghost btn-xs text-gray-400 hover:text-red-400"
                                  title="Reset to built-in"
                                >
                                  Reset to built-in
                                </ArmedButton>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
                {editingBuiltin ? 'Edit Built-in Question' : editingQuestionId ? 'Edit Question' : 'Add Question'}
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
                  disabled={!!editingBuiltin}
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
                  Supports paragraphs, bullet lists (<code className="text-yellow-400">- item</code>), bold (<code className="text-yellow-400">**bold**</code>), italic (<code className="text-yellow-400">*italic*</code>), code (<code className="text-yellow-400">`code`</code>) and links (<code className="text-yellow-400">[label](url)</code>). A <code className="text-yellow-400">{'{name}'}</code> is replaced by today&apos;s value; a line that is only <code className="text-yellow-400">{'{{block}}'}</code> shows a live block. See the reference below.
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
                <AnswerPreview answer={questionForm.answer} values={values} />
              </div>
              {(() => {
                const p = findFaqProblems(`${questionForm.question}\n${questionForm.answer}`, values);
                const bad = [...p.placeholders.map(x => `{${x}}`), ...p.blocks.map(x => `{{${x}}}`)];
                return bad.length > 0 ? (
                  <p className="text-xs text-amber-400">Unknown, shown as typed: {bad.join(', ')}</p>
                ) : null;
              })()}

              <div className={`flex items-center gap-2 pt-1 ${editingBuiltin ? 'hidden' : ''}`}>
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

      {/* ── PLACEHOLDER REFERENCE ── */}
      <details className="rounded-xl border border-gray-800 bg-gray-900/50 p-3 text-xs text-gray-400">
        <summary className="cursor-pointer font-semibold text-gray-300">Placeholders and live blocks</summary>
        <p className="mt-2">Write a placeholder as <code className="text-yellow-400">{'{name}'}</code> in any question or answer; it is replaced by the value shown here when the page loads. Put a block on a line of its own.</p>
        <ul className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {Object.entries(values).map(([k, v]) => (
            <li key={k} className="min-w-0 truncate"><code className="text-yellow-400">{`{${k}}`}</code> <span className="text-gray-500">{v || '(empty right now)'}</span></li>
          ))}
        </ul>
        <p className="mt-2">Blocks: {FAQ_BLOCK_NAMES.map(n => <code key={n} className="text-yellow-400 mr-2">{`{{${n}}}`}</code>)}</p>
      </details>

      <p className="text-xs text-gray-500">Privacy and Terms are legal pages and are not edited here.</p>

      {/* ── FOOTER ACTIONS ── */}
      <div className="pt-6 border-t border-gray-800 flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
        <div>
          <span>Need to restore initial state? </span>
          <ArmedButton
            disabled={pending}
            onConfirm={handleResetFaq}
            armedLabel="Sure? Clears custom questions and built-in edits"
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
