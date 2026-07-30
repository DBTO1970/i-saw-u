'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { deleteAllUserPhotosAction, deleteUserAccountAction } from '../app/actions/account-management';

export default function AccountCleanupControls() {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState(null);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  async function runAction(action, label) {
    const promptValue = window.prompt(
      `Type ${label} to confirm this permanent action.\n\n${action === 'account' ? 'This will delete your account, your library photos, your saved shows, and your profile.' : 'This will permanently delete every photo in your library and remove the related storage files.'}`
    );

    if (promptValue?.trim() !== label) {
      setMessage('Cancelled.');
      return;
    }

    setPendingAction(action);
    setMessage('');

    startTransition(async () => {
      const result = action === 'account'
        ? await deleteUserAccountAction()
        : await deleteAllUserPhotosAction();

      if (result.success) {
        setMessage(result.message || 'Done.');
        if (action === 'account') {
          router.replace('/');
        } else {
          router.refresh();
        }
      } else {
        setMessage(result.error || 'The action could not be completed.');
      }

      setPendingAction(null);
    });
  }

  return (
    <div className="space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-slate-300">
      <div>
        <h3 className="text-sm font-semibold text-white">Account & data controls</h3>
        <p className="mt-1 text-sm text-slate-400">
          These actions are permanent. They remove your uploaded photos and related data from this app.
        </p>
      </div>

      {message ? (
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
          {message}
        </div>
      ) : null}

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => runAction('photos', 'DELETE PHOTOS')}
          disabled={isPending}
          className="flex w-full items-center justify-between rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-left text-sm font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{pendingAction === 'photos' ? 'Deleting…' : 'Delete all my photos'}</span>
          <span aria-hidden="true">→</span>
        </button>

        <button
          type="button"
          onClick={() => runAction('account', 'DELETE MY ACCOUNT')}
          disabled={isPending}
          className="flex w-full items-center justify-between rounded-xl border border-red-500/60 bg-red-600/20 px-3 py-2.5 text-left text-sm font-semibold text-red-100 transition hover:bg-red-600/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>{pendingAction === 'account' ? 'Deleting account…' : 'Delete my account'}</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
