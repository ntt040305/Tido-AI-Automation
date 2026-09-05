import re

p = 'lib/image-engine/compiler/MasterPromptCompilerService.ts'
s = open(p, encoding='utf-8').read()
lines = s.split('\n')

a = b = c = None
for i, l in enumerate(lines):
    t = l.strip()
    if t.startswith('// 9.5 Creative Quality') and a is None:
        a = i
    if t.startswith('// 10. Provider Prompt Optimization') and b is None:
        b = i
    if t.startswith('// 7. Substitute Placeholders') and c is None:
        c = i
assert a is not None and b is not None and c is not None, (a, b, c)
assert c < a < b

block = lines[a:b]

# Turn the two `compiledPrompt += ...` appends into pushes onto a list, so the
# blocks exist as text before the prompt is assembled and can be measured.
text = '\n'.join(block)
text = text.replace(
    'compiledPrompt += `\\n\\n${creativeConstraintService.getPromptDirective(creativeConstraints)}`;',
    'appendedBlocks.push(creativeConstraintService.getPromptDirective(creativeConstraints));'
)
text = text.replace(
    'compiledPrompt += `\\n\\n${inspirationBlock}`;',
    'appendedBlocks.push(inspirationBlock);'
)
assert 'compiledPrompt +=' not in text, 'an append was not converted'

header = (
    '    // 6.9 Trailing blocks.\n'
    '    //\n'
    '    // Built BEFORE assembly so their real size is known. They used to be appended\n'
    '    // after the knowledge-fit loop had already run against a fixed 2,500-character\n'
    '    // guess, so a large inspiration subject-lock block pushed the finished prompt\n'
    '    // past the ceiling and the budget reducer then deleted the campaign strategy to\n'
    '    // claw it back. Measuring instead of guessing removes that whole failure.\n'
    '    const appendedBlocks: string[] = [];\n\n'
)

new_lines = lines[:c] + (header + text).split('\n') + [''] + lines[c:a] + lines[b:]
s2 = '\n'.join(new_lines)

# substitute() must now include the trailing blocks.
old_sub_tail = '      out = out.replace("{{RELEVANT_KNOWLEDGE}}", knowledgeText);\n      return out;'
new_sub_tail = (
    '      out = out.replace("{{RELEVANT_KNOWLEDGE}}", knowledgeText);\n'
    '      return appendedBlocks.length > 0 ? `${out}\\n\\n${appendedBlocks.join("\\n\\n")}` : out;'
)
assert old_sub_tail in s2
s2 = s2.replace(old_sub_tail, new_sub_tail)

# The reserve is obsolete now that the trailing blocks are inside the measurement.
old_loop = '''    // Fit knowledge to the remaining budget before anything else is considered for
    // removal. Trailing appended blocks are not yet attached, so a reserve is held
    // back for them. Dropping the lowest-ranked specialist block is a graceful
    // degradation the retrieval layer already ordered for us; dropping the client's
    // campaign strategy to save 500 characters is not.
    const APPENDED_BLOCK_RESERVE = 2500;
    const knowledgeFitCeiling = PromptBudgetManagerService.EMERGENCY_TARGET - APPENDED_BLOCK_RESERVE;
    const droppedKnowledgeIds: string[] = [];
    let specialistLimit = specialistContentBlocks.length;

    while (compiledPrompt.length > knowledgeFitCeiling && specialistLimit > 0) {
      specialistLimit--;
      knowledgeRender = renderKnowledge(specialistLimit);
      relevantKnowledgeText = knowledgeRender.text;
      compiledPrompt = substitute(relevantKnowledgeText);
    }

    if (knowledgeRender.droppedIds.length > 0) {
      droppedKnowledgeIds.push(...knowledgeRender.droppedIds);
      warnings.push("KNOWLEDGE_TRIMMED_FOR_BUDGET");
      console.warn("[MASTER_PROMPT_COMPILER][KNOWLEDGE_TRIMMED]", {
        message: "Prompt budget required dropping the lowest-ranked specialist knowledge blocks.",
        dropped: knowledgeRender.droppedIds,
        kept_specialist_blocks: specialistLimit,
      });
    }'''

new_loop = '''    // Fit knowledge to the budget before anything else is considered for removal.
    //
    // The whole prompt is now measured, trailing blocks included, so this loop knows
    // the true size. Knowledge is the only naturally divisible section: everything
    // else is a client requirement, an identity lock or a single resolved decision,
    // none of which can be partially kept. Specialist blocks go first, lowest
    // retrieval rank first, and only then universal core blocks — never below a
    // floor of two, because the universal set is what keeps a render physically
    // coherent.
    const knowledgeFitCeiling = PromptBudgetManagerService.EMERGENCY_TARGET;
    const droppedKnowledgeIds: string[] = [];
    let specialistLimit = specialistContentBlocks.length;
    let universalLimit = universalContentBlocks.length;
    const UNIVERSAL_FLOOR = 2;

    while (compiledPrompt.length > knowledgeFitCeiling && specialistLimit > 0) {
      specialistLimit--;
      knowledgeRender = renderKnowledge(specialistLimit, universalLimit);
      relevantKnowledgeText = knowledgeRender.text;
      compiledPrompt = substitute(relevantKnowledgeText);
    }

    while (compiledPrompt.length > knowledgeFitCeiling && universalLimit > UNIVERSAL_FLOOR) {
      universalLimit--;
      knowledgeRender = renderKnowledge(specialistLimit, universalLimit);
      relevantKnowledgeText = knowledgeRender.text;
      compiledPrompt = substitute(relevantKnowledgeText);
    }

    if (knowledgeRender.droppedIds.length > 0) {
      droppedKnowledgeIds.push(...knowledgeRender.droppedIds);
      warnings.push("KNOWLEDGE_TRIMMED_FOR_BUDGET");
      console.warn("[MASTER_PROMPT_COMPILER][KNOWLEDGE_TRIMMED]", {
        message: "Prompt budget required dropping the lowest-ranked knowledge blocks.",
        dropped: knowledgeRender.droppedIds,
        kept_specialist_blocks: specialistLimit,
        kept_universal_blocks: universalLimit,
      });
    }'''

assert old_loop in s2, 'fit loop not found'
s2 = s2.replace(old_loop, new_loop)

open(p, 'w', encoding='utf-8').write(s2)
print('moved trailing blocks above assembly; fit loop now measures the whole prompt')
