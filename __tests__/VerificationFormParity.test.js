const fs = require('fs');
const path = require('path');

const sourcePath = path.resolve(__dirname, '../src/screens/forms/VerificationFormScreen.tsx');
const source = fs.readFileSync(sourcePath, 'utf8');

const extractStringValues = body =>
  Array.from(body.matchAll(/'([^']+)'/g)).map(match => match[1]);

describe('VerificationForm legacy parity guards', () => {
  it('keeps callRemark in all Untraceable templates', () => {
    const untraceableTemplates = Array.from(
      source.matchAll(/const\s+(legacyUntraceable\w+Fields)\s*=\s*withLegacy\w+Order\(\[([\s\S]*?)\]\);/g),
    );

    expect(untraceableTemplates).toHaveLength(9);

    for (const [, templateName, templateBody] of untraceableTemplates) {
      expect(templateBody).toMatch(/name:\s*'callRemark'/);
      expect(templateBody).toMatch(/name:\s*'callRemark'[\s\S]*required:\s*true/);
      expect(templateName).toContain('Untraceable');
    }
  });

  it('keeps callRemarkUntraceable option values identical to legacy', () => {
    const expected = [
      'Did Not Pick Up Call',
      'Number is Switch Off',
      'Number is Unreachable',
      'Refused to Guide Address',
    ];

    const optionBlocks = Array.from(source.matchAll(/callRemarkUntraceable:\s*\[([\s\S]*?)\]/g));
    expect(optionBlocks.length).toBeGreaterThan(0);

    for (const [, block] of optionBlocks) {
      expect(extractStringValues(block)).toEqual(expected);
    }
  });

  it('keeps APF outcome map strictly limited to allowed outcomes', () => {
    const apfMapMatch = source.match(
      /const\s+legacyPropertyApfFieldsByOutcome[\s\S]*?=\s*\{([\s\S]*?)\};/,
    );
    expect(apfMapMatch).not.toBeNull();

    const mapBody = apfMapMatch?.[1] ?? '';
    const keys = Array.from(mapBody.matchAll(/(POSITIVE|SHIFTED|NSP|ENTRY_RESTRICTED|UNTRACEABLE)\s*:/g))
      .map(match => match[1]);

    expect(keys).toEqual(['POSITIVE', 'ENTRY_RESTRICTED', 'UNTRACEABLE']);
    expect(mapBody).not.toMatch(/SHIFTED\s*:/);
    expect(mapBody).not.toMatch(/NSP\s*:/);
  });

  it('keeps Property Individual map free of unreachable SHIFTED entry', () => {
    const mapMatch = source.match(
      /const\s+legacyPropertyIndividualFieldsByOutcome[\s\S]*?=\s*\{([\s\S]*?)\};/,
    );
    expect(mapMatch).not.toBeNull();

    const mapBody = mapMatch?.[1] ?? '';
    expect(mapBody).not.toMatch(/SHIFTED\s*:/);
    expect(mapBody).toMatch(/NSP\s*:/);
    expect(mapBody).toMatch(/ENTRY_RESTRICTED\s*:/);
    expect(mapBody).toMatch(/UNTRACEABLE\s*:/);
    expect(mapBody).toMatch(/POSITIVE\s*:/);
  });

  it('has explicit coercion warning path (not silent fallback)', () => {
    expect(source).toMatch(/type\s+OutcomeCoercionResult[\s\S]*warning:\s*string\s*\|\s*null/);
    expect(source).toMatch(/Outcome "\$\{rawValue\}" is invalid for/);
    expect(source).toMatch(/Logger\.warn\('VerificationFormScreen',\s*'Outcome was coerced/);
    expect(source).toMatch(/setOutcomeWarning\(/);
  });
});
