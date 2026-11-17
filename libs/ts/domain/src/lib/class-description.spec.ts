import { describe, expect, it } from 'vitest';
import {
  classDescriptionToHtml,
  classDescriptionToPlainText,
} from './class-description';

describe('classDescriptionToHtml', () => {
  it('wraps a single line in one paragraph', () => {
    expect(classDescriptionToHtml('Learn the basics of pottery.')).toBe(
      '<p>Learn the basics of pottery.</p>'
    );
  });

  it('starts a new paragraph at a blank line', () => {
    expect(classDescriptionToHtml('First.\n\nSecond.\n\n\n\nThird.')).toBe(
      '<p>First.</p><p>Second.</p><p>Third.</p>'
    );
  });

  it('turns a single line break into <br>', () => {
    expect(classDescriptionToHtml('Bring:\nAn apron\nA towel')).toBe(
      '<p>Bring:<br>An apron<br>A towel</p>'
    );
  });

  it('handles Windows line endings and trailing spaces', () => {
    expect(classDescriptionToHtml('First.  \r\n\r\nSecond.\r\nThird.\r\n')).toBe(
      '<p>First.</p><p>Second.<br>Third.</p>'
    );
  });

  it('treats a whitespace-only line as a blank line', () => {
    expect(classDescriptionToHtml('First.\n   \nSecond.')).toBe(
      '<p>First.</p><p>Second.</p>'
    );
  });

  it('renders **bold**', () => {
    expect(classDescriptionToHtml('This is **really fun** to learn.')).toBe(
      '<p>This is <strong>really fun</strong> to learn.</p>'
    );
  });

  it('renders *italic* and _italic_', () => {
    expect(classDescriptionToHtml('An *easy* and _relaxed_ class.')).toBe(
      '<p>An <em>easy</em> and <em>relaxed</em> class.</p>'
    );
  });

  it('renders bold and italic together', () => {
    expect(classDescriptionToHtml('***No sewing needed!***')).toBe(
      '<p><strong><em>No sewing needed!</em></strong></p>'
    );
    expect(classDescriptionToHtml('**Bold with *italic* inside**')).toBe(
      '<p><strong>Bold with <em>italic</em> inside</strong></p>'
    );
  });

  it('leaves asterisks and underscores that are not markers', () => {
    expect(classDescriptionToHtml('Panels are 2 * 3 * 4 inches.')).toBe(
      '<p>Panels are 2 * 3 * 4 inches.</p>'
    );
    expect(classDescriptionToHtml('Ages 12+ *with an adult')).toBe(
      '<p>Ages 12+ *with an adult</p>'
    );
    expect(classDescriptionToHtml('Save as my_first_panel.')).toBe(
      '<p>Save as my_first_panel.</p>'
    );
    expect(classDescriptionToHtml('** not bold **')).toBe(
      '<p>** not bold **</p>'
    );
  });

  it('does not carry a marker across a line break', () => {
    expect(classDescriptionToHtml('**one\ntwo**')).toBe(
      '<p>**one<br>two**</p>'
    );
  });

  it('escapes HTML instead of rendering it', () => {
    expect(
      classDescriptionToHtml('Glass & copper <script>alert(1)</script>')
    ).toBe('<p>Glass &amp; copper &lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('returns an empty string for a blank description', () => {
    expect(classDescriptionToHtml('  \n \n')).toBe('');
  });

  it('gives the same answer on repeated calls', () => {
    const text = 'A **bold** start.\n\nAnd an *italic* end.';
    expect(classDescriptionToHtml(text)).toBe(classDescriptionToHtml(text));
  });
});

describe('classDescriptionToPlainText', () => {
  it('removes the markers and keeps the words', () => {
    expect(
      classDescriptionToPlainText('A **bold**, *easy* and _relaxed_ class.')
    ).toBe('A bold, easy and relaxed class.');
  });

  it('keeps line breaks and paragraphs', () => {
    expect(classDescriptionToPlainText('First.\r\n\r\n**Second.**\nThird.')).toBe(
      'First.\n\nSecond.\nThird.'
    );
  });

  it('leaves text without markers unchanged', () => {
    expect(classDescriptionToPlainText('Panels are 2 * 3 inches & my_file')).toBe(
      'Panels are 2 * 3 inches & my_file'
    );
  });
});
