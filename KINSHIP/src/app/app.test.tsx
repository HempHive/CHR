import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '@/app/App';
import { createMemoryStore } from '@/persistence/memory-store';

describe('archive journey', () => {
  it('creates an archive, saves a person, finds them, and still has them after a restart', async () => {
    const user = userEvent.setup();
    const store = createMemoryStore();
    const first = render(<App store={store} />);
    expect(await screen.findByRole('heading', { name: 'KINSHIP' })).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Archive name' }), 'Ward');
    await user.click(screen.getByRole('button', { name: 'Create archive' }));
    expect(await screen.findByRole('heading', { name: 'Ward' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'People' }));
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.type(screen.getByRole('textbox', { name: 'Given names' }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: 'Family names' }), 'Ward');
    await user.click(screen.getByRole('button', { name: 'Save person' }));
    expect(await screen.findByRole('heading', { name: 'Ada Ward' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Search' }));
    await user.type(screen.getByRole('textbox', { name: 'Search the archive' }), 'Ada');
    expect(await screen.findByRole('button', { name: /Ada Ward/ })).toBeInTheDocument();

    first.unmount();
    window.location.hash = '#/';
    render(<App store={store} />);
    expect(await screen.findByRole('heading', { name: 'Ward' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'People' }));
    expect(await screen.findByRole('button', { name: /Ada Ward/ })).toBeInTheDocument();
  });

  it('asks before leaving an unsaved person', async () => {
    const user = userEvent.setup();
    render(<App store={createMemoryStore()} />);
    await user.type(await screen.findByRole('textbox', { name: 'Archive name' }), 'Ward');
    await user.click(screen.getByRole('button', { name: 'Create archive' }));
    await user.click(await screen.findByRole('link', { name: 'People' }));
    await user.click(screen.getByRole('button', { name: 'Add a person' }));
    await user.type(screen.getByRole('textbox', { name: 'Given names' }), 'Ada');
    await user.click(screen.getByRole('link', { name: 'Home' }));
    const dialog = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    expect(dialog).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('heading', { name: 'Add a person' })).toBeInTheDocument();
  });
});
