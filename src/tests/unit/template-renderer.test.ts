import { describe, it, expect } from 'vitest';

// Test the template rendering logic (extracted from ChannelRouter)
function renderTemplate(
  template: { subject?: string; body: string; variables: string[] },
  context: Record<string, unknown>
): { subject?: string; body: string } {
  let renderedBody = template.body;
  let renderedSubject = template.subject;

  for (const variable of template.variables) {
    const value = context[variable];
    const placeholder = new RegExp(`\\{\\{${variable}\\}\\}`, 'g');
    renderedBody = renderedBody.replace(placeholder, String(value || ''));
    if (renderedSubject) {
      renderedSubject = renderedSubject.replace(placeholder, String(value || ''));
    }
  }

  return { subject: renderedSubject, body: renderedBody };
}

describe('Template Renderer', () => {
  it('should replace single variable in body', () => {
    const template = {
      body: 'Hello {{name}}!',
      variables: ['name'],
    };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.body).toBe('Hello Alice!');
  });

  it('should replace multiple variables in body', () => {
    const template = {
      body: 'Hello {{name}}, welcome to {{appName}}!',
      variables: ['name', 'appName'],
    };
    const result = renderTemplate(template, { name: 'Alice', appName: 'MyApp' });
    expect(result.body).toBe('Hello Alice, welcome to MyApp!');
  });

  it('should replace variables in subject', () => {
    const template = {
      subject: 'Welcome to {{appName}}!',
      body: 'Hello {{name}}!',
      variables: ['name', 'appName'],
    };
    const result = renderTemplate(template, { name: 'Alice', appName: 'MyApp' });
    expect(result.subject).toBe('Welcome to MyApp!');
    expect(result.body).toBe('Hello Alice!');
  });

  it('should replace variable multiple times in same body', () => {
    const template = {
      body: '{{name}} is {{name}}!',
      variables: ['name'],
    };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.body).toBe('Alice is Alice!');
  });

  it('should replace missing variables with empty string', () => {
    const template = {
      body: 'Hello {{name}}, your code is {{code}}!',
      variables: ['name', 'code'],
    };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.body).toBe('Hello Alice, your code is !');
  });

  it('should handle template with no variables', () => {
    const template = {
      body: 'This is a static message',
      variables: [],
    };
    const result = renderTemplate(template, {});
    expect(result.body).toBe('This is a static message');
  });

  it('should handle empty subject', () => {
    const template = {
      body: 'Hello {{name}}!',
      variables: ['name'],
    };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.subject).toBeUndefined();
  });

  it('should handle special characters in variable values', () => {
    const template = {
      body: 'URL: {{actionUrl}}',
      variables: ['actionUrl'],
    };
    const result = renderTemplate(template, {
      actionUrl: 'https://example.com/verify?token=abc123',
    });
    expect(result.body).toBe('URL: https://example.com/verify?token=abc123');
  });
});
