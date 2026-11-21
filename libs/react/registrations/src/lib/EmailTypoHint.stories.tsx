import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { expect, userEvent, within } from 'storybook/test';
import { Box, TextField } from '@mui/material';
import { EmailTypoHint } from './EmailTypoHint';

/** Built at runtime so no real-looking address sits in the source. */
const at = (local: string, domain: string): string => `${local}@${domain}`;

/** The hint under a real email field, the way the forms use it. */
function FieldWithHint({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial);
  return (
    <Box sx={{ maxWidth: 360 }}>
      <TextField
        label="Email address"
        type="email"
        size="small"
        fullWidth
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <EmailTypoHint email={email} onAccept={setEmail} />
    </Box>
  );
}

const meta: Meta<typeof FieldWithHint> = {
  title: 'Registrations/EmailTypoHint',
  component: FieldWithHint,
};
export default meta;

type Story = StoryObj<typeof FieldWithHint>;

/** A mistyped domain: the hint offers the fix, and one click applies it. */
export const MistypedDomain: Story = {
  args: { initial: at('robin', 'gnail.com') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const fixed = at('robin', 'gmail.com');
    await expect(canvas.getByTestId('email-typo-hint')).toHaveTextContent(
      `Did you mean ${fixed}?`
    );
    await userEvent.click(canvas.getByRole('button', { name: fixed }));
    await expect(canvas.getByLabelText('Email address')).toHaveValue(fixed);
    await expect(canvas.queryByTestId('email-typo-hint')).toBeNull();
  },
};

/** A correct address shows nothing. */
export const CorrectAddress: Story = {
  args: { initial: at('robin', 'example.com') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByTestId('email-typo-hint')).toBeNull();
  },
};
