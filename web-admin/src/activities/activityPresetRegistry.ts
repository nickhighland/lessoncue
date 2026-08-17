import type { ActivityTheme } from './types';

export type ActivityThemePreset = NonNullable<ActivityTheme['preset']>;

export const ACTIVITY_THEME_PRESETS: Record<ActivityThemePreset, ActivityTheme> = {
  stage: { preset: 'stage', primaryColor: '#2a6e4a', secondaryColor: '#2563eb', accentColor: '#f59e0b', backgroundColor: '#091c1d', textColor: '#ffffff', soundPack: 'gameshow', backgroundMotion: true },
  neon: { preset: 'neon', primaryColor: '#7c3aed', secondaryColor: '#ec4899', accentColor: '#22d3ee', backgroundColor: '#100724', textColor: '#ffffff', soundPack: 'arcade', backgroundMotion: true },
  retro: { preset: 'retro', primaryColor: '#c2410c', secondaryColor: '#eab308', accentColor: '#14b8a6', backgroundColor: '#21130d', textColor: '#fff7ed', soundPack: 'gameshow', backgroundMotion: true },
  arcade: { preset: 'arcade', primaryColor: '#0f766e', secondaryColor: '#22c55e', accentColor: '#f97316', backgroundColor: '#041c1a', textColor: '#f0fdf4', soundPack: 'arcade', backgroundMotion: true },
  cyberpunk: { preset: 'cyberpunk', primaryColor: '#0e7490', secondaryColor: '#a855f7', accentColor: '#f43f5e', backgroundColor: '#080c1f', textColor: '#f8fafc', soundPack: 'arcade', backgroundMotion: true },
  clean: { preset: 'clean', primaryColor: '#2563eb', secondaryColor: '#0f766e', accentColor: '#f59e0b', backgroundColor: '#0f172a', textColor: '#f8fafc', soundPack: 'minimal', backgroundMotion: false }
};

const themeForCatalog = (category: string, type: string): ActivityTheme => {
  const preset: ActivityThemePreset = type === 'imageReveal' ? 'cyberpunk'
    : category === 'creative' || category === 'drawing' ? 'neon'
      : category === 'sorting' || category === 'word' || category === 'match' ? 'arcade'
        : category === 'utilities' ? 'retro'
          : category === 'physical' || category === 'stage' ? 'stage'
            : 'stage';
  return { ...ACTIVITY_THEME_PRESETS[preset] };
};

export interface ActivityPresetTemplate {
  id: string;
  label: string;
  description: string;
  config: Record<string, unknown>;
  theme?: ActivityTheme;
}

export const QUIZ_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'trivia',
    label: 'Trivia',
    description: 'Teacher-authored questions with any number of choices from 2–8.',
    config: {
      preset: 'trivia',
      presetLabel: 'TRIVIA',
      title: 'Trivia',
      questions: [{ id: 'question-1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, explanation: 'Mars appears red because of iron oxide on its surface.' }]
    }
  },
  {
    id: 'factOrFiction',
    label: 'Fact or Fiction',
    description: 'A quick binary knowledge check with a clear reveal.',
    config: {
      preset: 'factOrFiction',
      presetLabel: 'FACT OR FICTION',
      title: 'Fact or Fiction',
      questions: [{ id: 'question-1', prompt: 'A day on Venus is longer than a year on Venus.', options: ['Fact', 'Fiction'], correctIndex: 0, explanation: 'Venus rotates so slowly that one rotation takes longer than one trip around the Sun.' }]
    }
  },
  {
    id: 'twoTruthsAndALie',
    label: 'Two Truths & a Lie',
    description: 'Choose the one statement that does not belong.',
    config: {
      preset: 'twoTruthsAndALie',
      presetLabel: 'TWO TRUTHS & A LIE',
      title: 'Two Truths & a Lie',
      questions: [{ id: 'question-1', prompt: 'Which statement is the lie about a school day?', options: ['A class can have a bell.', 'A pencil can roll.', 'The sun rises in the west.'], correctIndex: 2, explanation: 'The sun rises in the east.' }]
    }
  },
  {
    id: 'spotTheFake',
    label: 'Spot the Fake',
    description: 'Find the invented option hidden among believable answers.',
    config: {
      preset: 'spotTheFake',
      presetLabel: 'SPOT THE FAKE',
      title: 'Spot the Fake',
      questions: [{ id: 'question-1', prompt: 'Which item does not belong in a basic emergency kit?', options: ['Water', 'Flashlight', 'A cloud', 'Bandages'], correctIndex: 2, explanation: 'A cloud is not a basic emergency-kit item.' }]
    }
  },
  {
    id: 'finishTheQuote',
    label: 'Finish the Quote',
    description: 'Complete a familiar phrase or replace it with your own lesson text.',
    config: {
      preset: 'finishTheQuote',
      presetLabel: 'FINISH THE QUOTE',
      title: 'Finish the Quote',
      questions: [{ id: 'question-1', prompt: 'Finish this phrase: Better late than ____.', answerMode: 'text', acceptedAnswers: ['never'], correctText: 'never' }]
    }
  },
  {
    id: 'fillTheBlank',
    label: 'Fill the Blank',
    description: 'Turn a lesson sentence or key term into a structured recall question.',
    config: {
      preset: 'fillTheBlank',
      presetLabel: 'FILL THE BLANK',
      title: 'Fill the Blank',
      questions: [{ id: 'question-1', prompt: 'A triangle has ____ sides.', answerMode: 'text', acceptedAnswers: ['3'], correctText: '3' }]
    }
  },
  {
    id: 'higherOrLower',
    label: 'Higher or Lower',
    description: 'Ask the room to classify a value, fact, or result relative to a reference.',
    config: {
      preset: 'higherOrLower',
      presetLabel: 'HIGHER OR LOWER',
      title: 'Higher or Lower',
      questions: [{ id: 'question-1', prompt: 'Is the answer higher or lower than 50?', options: ['Higher', 'Lower', 'Exactly 50'], correctIndex: 0 }]
    }
  },
  {
    id: 'guessTheNumber',
    label: 'Guess the Number',
    description: 'Use ranges as a friendly number-estimation warm-up.',
    config: {
      preset: 'guessTheNumber',
      presetLabel: 'GUESS THE NUMBER',
      title: 'Guess the Number',
      questions: [{ id: 'question-1', prompt: 'What is the mystery number?', answerMode: 'number', targetNumber: 42, tolerance: 0, scoringMode: 'exact', points: 100 }]
    }
  },
  {
    id: 'isItAHorse',
    label: 'Is It a Horse?',
    description: 'A playful, generic yes/no classification game; replace the prompt with any category.',
    config: {
      preset: 'isItAHorse',
      presetLabel: 'IS IT A HORSE?',
      title: 'Is It a Horse?',
      questions: [{ id: 'question-1', prompt: 'Is this example in the target category?', options: ['Yes', 'No'], correctIndex: 0, explanation: 'Replace this generic example with your own classification prompt.' }]
    }
  },
  { id: 'whoSaidIt', label: 'Who Said It?', description: 'Choose the speaker or source behind a teacher-authored quote.', config: { preset: 'whoSaidIt', presetLabel: 'WHO SAID IT?', title: 'Who Said It?', questions: [{ id: 'question-1', prompt: 'Who said this: “Add a quote here”?', options: ['Person A', 'Person B', 'Person C'], correctIndex: 0 }] } },
  { id: 'whichLesson', label: 'Which Lesson?', description: 'Connect a clue or idea to the correct lesson topic.', config: { preset: 'whichLesson', presetLabel: 'WHICH LESSON?', title: 'Which Lesson?', questions: [{ id: 'question-1', prompt: 'Which lesson does this idea belong to?', options: ['Lesson A', 'Lesson B', 'Lesson C'], correctIndex: 0 }] } },
  { id: 'recapRace', label: 'Recap Race', description: 'Turn a quick review into a fast run of teacher-authored questions.', config: { preset: 'recapRace', presetLabel: 'RECAP RACE', title: 'Recap Race', questions: [{ id: 'question-1', prompt: 'What is the most important idea from today?', options: ['Idea A', 'Idea B', 'Idea C'], correctIndex: 0 }, { id: 'question-2', prompt: 'Which example best illustrates it?', options: ['Example A', 'Example B', 'Example C'], correctIndex: 1 }] } },
  { id: 'keyWord', label: 'Key Word', description: 'Identify the key term that unlocks the teacher’s prompt.', config: { preset: 'keyWord', presetLabel: 'KEY WORD', title: 'Key Word', questions: [{ id: 'question-1', prompt: 'Which word best completes the idea?', options: ['Term A', 'Term B', 'Term C'], correctIndex: 1 }] } },
  { id: 'beforeOrAfter', label: 'Before or After', description: 'Place a fact, event, or idea on the correct side of a reference point.', config: { preset: 'beforeOrAfter', presetLabel: 'BEFORE OR AFTER', title: 'Before or After', questions: [{ id: 'question-1', prompt: 'Did this happen before or after the reference event?', options: ['Before', 'After', 'At the same time'], correctIndex: 0 }] } },
  { id: 'whichCameFirst', label: 'Which Came First?', description: 'Compare two items and choose the earlier one.', config: { preset: 'whichCameFirst', presetLabel: 'WHICH CAME FIRST?', title: 'Which Came First?', questions: [{ id: 'question-1', prompt: 'Which came first?', options: ['Item A', 'Item B'], correctIndex: 0 }] } },
  { id: 'overUnder', label: 'Over / Under', description: 'Make a quick estimate relative to a teacher-defined number.', config: { preset: 'overUnder', presetLabel: 'OVER / UNDER', title: 'Over / Under', questions: [{ id: 'question-1', prompt: 'Is the value over or under the reference number?', options: ['Over', 'Under', 'Exactly equal'], correctIndex: 0 }] } },
  { id: 'closestWithoutGoingOver', label: 'Closest Without Going Over', description: 'Let everyone submit a number; the closest valid guess wins the round.', config: { preset: 'closestWithoutGoingOver', presetLabel: 'CLOSEST WITHOUT GOING OVER', title: 'Closest Without Going Over', questions: [{ id: 'question-1', prompt: 'How many pages are in the book? Closest guess without going over wins.', answerMode: 'number', targetNumber: 100, scoringMode: 'closestWithoutGoingOver', points: 100 }] } },
  { id: 'priceIsWrong', label: 'The Price Is Wrong', description: 'Use an intentionally surprising estimate as a lesson-friendly number game.', config: { preset: 'priceIsWrong', presetLabel: 'THE PRICE IS WRONG', title: 'The Price Is Wrong', questions: [{ id: 'question-1', prompt: 'What is the real price? Closest guess wins.', answerMode: 'number', targetNumber: 19.99, scoringMode: 'closest', points: 100 }] } },
  { id: 'definitelyReal', label: 'Definitely Real', description: 'Separate the authentic fact from teacher-authored decoys.', config: { preset: 'definitelyReal', presetLabel: 'DEFINITELY REAL', title: 'Definitely Real', questions: [{ id: 'question-1', prompt: 'Which statement is definitely real?', options: ['Statement A', 'Statement B', 'Statement C'], correctIndex: 0 }] } },
  { id: 'thatCantBeRight', label: 'That Can’t Be Right', description: 'Spot the answer that breaks the rules of the topic.', config: { preset: 'thatCantBeRight', presetLabel: 'THAT CAN’T BE RIGHT', title: 'That Can’t Be Right', questions: [{ id: 'question-1', prompt: 'Which answer cannot be right?', options: ['Answer A', 'Answer B', 'Answer C'], correctIndex: 2 }] } },
  { id: 'wagerTrivia', label: 'Wager Trivia', description: 'Risk a few points before each answer for a bigger swing when you are right.', config: { preset: 'wagerTrivia', presetLabel: 'WAGER TRIVIA', title: 'Wager Trivia', modifiers: { wager: { enabled: true, maxPoints: 100, defaultPoints: 25 } }, questions: [{ id: 'question-1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, points: 100 }] } },
  { id: 'survivorTrivia', label: 'Survivor Trivia', description: 'Keep answering while you still have lives; the last players standing reach the final reveal.', config: { preset: 'survivorTrivia', presetLabel: 'SURVIVOR TRIVIA', title: 'Survivor Trivia', modifiers: { lives: { enabled: true, startingLives: 3, eliminateAtZero: true } }, questions: [{ id: 'question-1', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter'], correctIndex: 1, points: 100 }] } }
];

export const POLL_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'readTheRoom',
    label: 'Read the Room',
    description: 'Reveal the distribution and see where the group lands.',
    config: { preset: 'readTheRoom', presetLabel: 'READ THE ROOM', question: 'Which choice best matches the room?', options: ['Option A', 'Option B', 'Option C'] }
  },
  {
    id: 'majorityRules',
    label: 'Majority Rules',
    description: 'Let the largest group answer the question for the room.',
    config: { preset: 'majorityRules', presetLabel: 'MAJORITY RULES', pollMode: 'majority', question: 'Which option do you think most people will choose?', options: ['Option A', 'Option B', 'Option C'], points: 100 }
  },
  {
    id: 'minorityReport',
    label: 'Minority Report',
    description: 'Invite the room to predict the least popular answer.',
    config: { preset: 'minorityReport', presetLabel: 'MINORITY REPORT', pollMode: 'minority', question: 'Which option will the fewest people choose?', options: ['Option A', 'Option B', 'Option C'], points: 100 }
  },
  {
    id: 'splitDecision',
    label: 'Split Decision',
    description: 'Create a clean either/or choice and show the split.',
    config: { preset: 'splitDecision', presetLabel: 'SPLIT DECISION', question: 'Which side are you on?', options: ['Side A', 'Side B'] }
  },
  {
    id: 'wouldYouRather',
    label: 'Would You Rather',
    description: 'Use two strong choices to spark a quick, playful debate.',
    config: { preset: 'wouldYouRather', presetLabel: 'WOULD YOU RATHER', question: 'Would you rather be 30 minutes early or 5 minutes late?', options: ['30 minutes early', '5 minutes late'] }
  },
  {
    id: 'hotTake',
    label: 'Hot Take',
    description: 'Turn a discussion prompt into a fast agree/disagree meter.',
    config: { preset: 'hotTake', presetLabel: 'HOT TAKE', question: 'A little disagreement makes a group more creative.', options: ['Agree', 'Not sure', 'Disagree'] }
  },
  {
    id: 'mostLikelyTo',
    label: 'Most Likely To',
    description: 'Use participant or team names as the choices.',
    config: { preset: 'mostLikelyTo', presetLabel: 'MOST LIKELY TO', question: 'Who is most likely to bring snacks for everyone?', options: ['Name 1', 'Name 2', 'Name 3'] }
  },
  {
    id: 'unpopularOpinion',
    label: 'Unpopular Opinion',
    description: 'Give the room a safe way to take a strong position.',
    config: { preset: 'unpopularOpinion', presetLabel: 'UNPOPULAR OPINION', question: 'Which everyday thing is overrated?', options: ['Option A', 'Option B', 'Option C', 'Option D'] }
  },
  {
    id: 'worstChoicePossible',
    label: 'Worst Choice Possible',
    description: 'Ask the group to identify the most delightfully terrible option.',
    config: { preset: 'worstChoicePossible', presetLabel: 'WORST CHOICE POSSIBLE', question: 'Which is the worst choice for a team mascot?', options: ['A sleepy turtle', 'A confused pigeon', 'A very loud alarm clock'] }
  },
  { id: 'thisOrThatGauntlet', label: 'This or That Gauntlet', description: 'Run a sequence of quick two-choice decisions.', config: { preset: 'thisOrThatGauntlet', presetLabel: 'THIS OR THAT GAUNTLET', rounds: [{ id: 'round-1', question: 'Which is worse: being 30 minutes early or 5 minutes late?', options: ['30 minutes early', '5 minutes late'] }, { id: 'round-2', question: 'Which would you rather give up for a week?', options: ['Music', 'Dessert'] }, { id: 'round-3', question: 'Which wins a rainy afternoon?', options: ['A movie marathon', 'A board game'] }] } },
  { id: 'consensus', label: 'Consensus', description: 'Find the option the room can agree on before revealing the distribution.', config: { preset: 'consensus', presetLabel: 'CONSENSUS', question: 'Which choice could the room agree to?', options: ['Option A', 'Option B', 'Option C'] } },
  { id: 'oneOfUs', label: 'One of Us', description: 'Use the group’s own names or roles as poll choices.', config: { preset: 'oneOfUs', presetLabel: 'ONE OF US', question: 'Who best fits this prompt?', options: ['Person A', 'Person B', 'Person C'] } },
  { id: 'knowYourGroup', label: 'Know Your Group', description: 'Ask a question that reveals how well the room knows itself.', config: { preset: 'knowYourGroup', presetLabel: 'KNOW YOUR GROUP', question: 'Which answer best describes this group?', options: ['Option A', 'Option B', 'Option C', 'Option D'] } },
  { id: 'yearbookAwards', label: 'Yearbook Awards', description: 'Let the room nominate a person or team for a playful award.', config: { preset: 'yearbookAwards', presetLabel: 'YEARBOOK AWARDS', question: 'Who wins this made-up award?', options: ['Person A', 'Person B', 'Person C'] } },
  { id: 'predictionMachine', label: 'Prediction Machine', description: 'Predict what the room will choose, then compare prediction to reality.', config: { preset: 'predictionMachine', presetLabel: 'PREDICTION MACHINE', pollMode: 'prediction', question: 'Which option will the room choose most often?', options: ['Option A', 'Option B', 'Option C'], points: 100 } },
  { id: 'tinyHillToDieOn', label: 'Tiny Hill to Die On', description: 'Take a harmless, strong position and see whether the room agrees.', config: { preset: 'tinyHillToDieOn', presetLabel: 'TINY HILL TO DIE ON', question: 'Which tiny opinion deserves your full support?', options: ['Option A', 'Option B', 'Option C'] } }
];

export const BUZZER_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'buzzerBattle',
    label: 'Buzzer Battle',
    description: 'Race to answer first as the host reveals a clue ladder.',
    config: {
      preset: 'buzzerBattle',
      presetLabel: 'BUZZER BATTLE',
      title: 'Buzzer Battle',
      clues: [{ id: 'clue-1', prompt: 'This warm-up answer is something bright in the night sky.', answer: 'The moon', points: 100 }, { id: 'clue-2', prompt: 'It can be full, new, or crescent.', answer: 'The moon', points: 75 }],
      lockOutOnMiss: true,
      wrongPenalty: 0
    }
  },
  {
    id: 'clueLadder',
    label: 'Clue Ladder',
    description: 'Make earlier clues worth more and reward confident buzzes.',
    config: {
      preset: 'clueLadder',
      presetLabel: 'CLUE LADDER',
      title: 'Clue Ladder',
      clues: [{ id: 'clue-1', prompt: 'This answer can be found in many kitchens.', answer: 'A refrigerator', points: 300 }, { id: 'clue-2', prompt: 'It keeps food cold.', answer: 'A refrigerator', points: 200 }, { id: 'clue-3', prompt: 'It often has a freezer on top or below.', answer: 'A refrigerator', points: 100 }],
      lockOutOnMiss: true,
      wrongPenalty: 0
    }
  },
  {
    id: 'mysteryPerson',
    label: 'Mystery Person',
    description: 'Reveal biographical clues about a person chosen by the teacher.',
    config: {
      preset: 'mysteryPerson',
      presetLabel: 'MYSTERY PERSON',
      title: 'Mystery Person',
      clues: [{ id: 'clue-1', prompt: 'This person is connected to today’s lesson.', answer: 'Add a person', points: 300 }, { id: 'clue-2', prompt: 'A detail about their work or life is…', answer: 'Add a person', points: 200 }, { id: 'clue-3', prompt: 'The final clue makes the answer clear.', answer: 'Add a person', points: 100 }]
    }
  },
  {
    id: 'mysteryPlace',
    label: 'Mystery Place',
    description: 'Use location clues for geography, history, or a room-based warm-up.',
    config: {
      preset: 'mysteryPlace',
      presetLabel: 'MYSTERY PLACE',
      title: 'Mystery Place',
      clues: [{ id: 'clue-1', prompt: 'This place is connected to the story or lesson.', answer: 'Add a place', points: 300 }, { id: 'clue-2', prompt: 'One landmark, region, or historical detail is…', answer: 'Add a place', points: 200 }, { id: 'clue-3', prompt: 'The final clue reveals the location.', answer: 'Add a place', points: 100 }]
    }
  },
  {
    id: 'mysteryObject',
    label: 'Mystery Object',
    description: 'Identify an object from broad-to-specific clues.',
    config: {
      preset: 'mysteryObject',
      presetLabel: 'MYSTERY OBJECT',
      title: 'Mystery Object',
      clues: [{ id: 'clue-1', prompt: 'You might find this near a desk or table.', answer: 'Add an object', points: 300 }, { id: 'clue-2', prompt: 'It is useful for a specific task.', answer: 'Add an object', points: 200 }, { id: 'clue-3', prompt: 'The final clue gives away its shape or name.', answer: 'Add an object', points: 100 }]
    }
  },
  {
    id: 'commonThread',
    label: 'Common Thread',
    description: 'Reveal examples until teams identify what connects them.',
    config: {
      preset: 'commonThread',
      presetLabel: 'COMMON THREAD',
      title: 'Common Thread',
      clues: [{ id: 'clue-1', prompt: 'Example one belongs in the hidden category.', answer: 'Add the common thread', points: 300 }, { id: 'clue-2', prompt: 'Example two narrows the category.', answer: 'Add the common thread', points: 200 }, { id: 'clue-3', prompt: 'The final example makes the connection clear.', answer: 'Add the common thread', points: 100 }]
    }
  },
  {
    id: 'password',
    label: 'Password',
    description: 'Use short one-word-style clues to get a teammate to say the answer.',
    config: {
      preset: 'password',
      presetLabel: 'PASSWORD',
      title: 'Password',
      clues: [{ id: 'clue-1', prompt: 'A one-word clue for your teammate.', answer: 'Add the password', points: 200 }, { id: 'clue-2', prompt: 'A second clue, no repeats.', answer: 'Add the password', points: 100 }]
    }
  },
  { id: 'secretCategory', label: 'Secret Category', description: 'Identify the hidden category from progressively clearer clues.', config: { preset: 'secretCategory', presetLabel: 'SECRET CATEGORY', title: 'Secret Category', clues: [{ id: 'clue-1', prompt: 'The first example belongs to the hidden category.', answer: 'Add the category', points: 300 }, { id: 'clue-2', prompt: 'A second example narrows the field.', answer: 'Add the category', points: 200 }, { id: 'clue-3', prompt: 'The final clue should make the category clear.', answer: 'Add the category', points: 100 }] } },
  { id: 'conceptPyramid', label: 'Concept Pyramid', description: 'Climb from a broad idea to the exact lesson concept.', config: { preset: 'conceptPyramid', presetLabel: 'CONCEPT PYRAMID', title: 'Concept Pyramid', clues: [{ id: 'clue-1', prompt: 'Start with a broad clue.', answer: 'Add the concept', points: 300 }, { id: 'clue-2', prompt: 'Narrow the idea with a useful detail.', answer: 'Add the concept', points: 200 }, { id: 'clue-3', prompt: 'Land on the key term.', answer: 'Add the concept', points: 100 }] } }
];

export const PUNCHLINE_PRESETS: ActivityPresetTemplate[] = [
  { id: 'punchline', label: 'Punchline', description: 'Finish a prompt with the funniest answer you can.', config: { preset: 'punchline', presetLabel: 'PUNCHLINE', title: 'Punchline', prompts: [{ id: 'prompt-1', prompt: 'The worst possible school mascot would be ______.', points: 100 }], requireModeration: true, votingSeconds: 30, votingStyle: 'gallery', headToHeadMatchPoints: 0 } },
  { id: 'captionThis', label: 'Caption This', description: 'Write a caption for a teacher-selected image or scene.', config: { preset: 'captionThis', presetLabel: 'CAPTION THIS', title: 'Caption This', prompts: [{ id: 'prompt-1', prompt: 'Write the caption this picture deserves.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'autocomplete', label: 'Autocomplete', description: 'Complete a sentence in the most surprising way.', config: { preset: 'autocomplete', presetLabel: 'AUTOCOMPLETE', title: 'Autocomplete', prompts: [{ id: 'prompt-1', prompt: 'I knew it was going to be a long day when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'badAdvice', label: 'Bad Advice', description: 'Give the least helpful answer to a very real problem.', config: { preset: 'badAdvice', presetLabel: 'BAD ADVICE', title: 'Bad Advice', prompts: [{ id: 'prompt-1', prompt: 'What is the worst advice for someone who forgot their homework?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'wrongAnswersOnly', label: 'Wrong Answers Only', description: 'Answer a simple prompt with a confidently incorrect response.', config: { preset: 'wrongAnswersOnly', presetLabel: 'WRONG ANSWERS ONLY', title: 'Wrong Answers Only', prompts: [{ id: 'prompt-1', prompt: 'What is this object definitely used for?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'sloganFactory', label: 'Slogan Factory', description: 'Invent a slogan for a team, idea, or imaginary product.', config: { preset: 'sloganFactory', presetLabel: 'SLOGAN FACTORY', title: 'Slogan Factory', prompts: [{ id: 'prompt-1', prompt: 'Create a slogan for a school that has one unusual rule.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'moviePitch', label: 'Movie Pitch', description: 'Pitch a movie from a short teacher-authored setup.', config: { preset: 'moviePitch', presetLabel: 'MOVIE PITCH', title: 'Movie Pitch', prompts: [{ id: 'prompt-1', prompt: 'Pitch a movie about a team that cannot agree on a name.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'makeItWorse', label: 'Make It Worse', description: 'Take an ordinary situation and escalate it creatively.', config: { preset: 'makeItWorse', presetLabel: 'MAKE IT WORSE', title: 'Make It Worse', prompts: [{ id: 'prompt-1', prompt: 'A normal group project becomes much worse when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'explainItBadly', label: 'Explain It Badly', description: 'Describe a familiar idea in the least helpful way possible.', config: { preset: 'explainItBadly', presetLabel: 'EXPLAIN IT BADLY', title: 'Explain It Badly', prompts: [{ id: 'prompt-1', prompt: 'Explain this everyday thing as badly as possible.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'renameIt', label: 'Rename It', description: 'Give an ordinary object, place, or idea a much better name.', config: { preset: 'renameIt', presetLabel: 'RENAME IT', title: 'Rename It', prompts: [{ id: 'prompt-1', prompt: 'Give this ordinary thing a new name.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'newProduct', label: 'New Product', description: 'Invent a product that solves a very specific problem.', config: { preset: 'newProduct', presetLabel: 'NEW PRODUCT', title: 'New Product', prompts: [{ id: 'prompt-1', prompt: 'Invent a product for a very specific problem.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'headline', label: 'Headline', description: 'Write the headline that would make everyone read the story.', config: { preset: 'headline', presetLabel: 'HEADLINE', title: 'Headline', prompts: [{ id: 'prompt-1', prompt: 'Write the headline for this unexpected event.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'deletedScene', label: 'Deleted Scene', description: 'Imagine the scene that was cut from the final story.', config: { preset: 'deletedScene', presetLabel: 'DELETED SCENE', title: 'Deleted Scene', prompts: [{ id: 'prompt-1', prompt: 'What happened in the deleted scene?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'alternateEnding', label: 'Alternate Ending', description: 'Rewrite the ending of a teacher-authored scenario.', config: { preset: 'alternateEnding', presetLabel: 'ALTERNATE ENDING', title: 'Alternate Ending', prompts: [{ id: 'prompt-1', prompt: 'Write a completely different ending.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'plotTwist', label: 'Plot Twist', description: 'Add the twist that changes everything at the last moment.', config: { preset: 'plotTwist', presetLabel: 'PLOT TWIST', title: 'Plot Twist', prompts: [{ id: 'prompt-1', prompt: 'The story changes when ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'excuseGenerator', label: 'Excuse Generator', description: 'Create the most creative excuse for a harmless situation.', config: { preset: 'excuseGenerator', presetLabel: 'EXCUSE GENERATOR', title: 'Excuse Generator', prompts: [{ id: 'prompt-1', prompt: 'Give the most creative excuse for being five minutes late.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'superpowerCatch', label: 'Superpower / Catch', description: 'Invent a superpower with one inconvenient limitation.', config: { preset: 'superpowerCatch', presetLabel: 'SUPERPOWER / CATCH', title: 'Superpower / Catch', prompts: [{ id: 'prompt-1', prompt: 'Your superpower is ______, but the catch is ______.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'explainThisPhoto', label: 'Explain This Photo', description: 'Write the story behind a teacher-selected image.', config: { preset: 'explainThisPhoto', presetLabel: 'EXPLAIN THIS PHOTO', title: 'Explain This Photo', prompts: [{ id: 'prompt-1', prompt: 'What is really happening in this photo?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'whoApprovedThis', label: 'Who Approved This?', description: 'Explain how an obviously questionable idea got approved.', config: { preset: 'whoApprovedThis', presetLabel: 'WHO APPROVED THIS?', title: 'Who Approved This?', prompts: [{ id: 'prompt-1', prompt: 'Why did anyone approve this idea?', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'worstRanking', label: 'Worst Ranking', description: 'Create the funniest ranking for a teacher-defined list.', config: { preset: 'worstRanking', presetLabel: 'WORST RANKING', title: 'Worst Ranking', prompts: [{ id: 'prompt-1', prompt: 'Give the worst possible ranking for this list.', points: 100 }], requireModeration: true, votingSeconds: 30 } }
];

export const FAKE_OUT_PRESETS: ActivityPresetTemplate[] = [
  { id: 'fakeOut', label: 'Fake Out', description: 'Find the real answer among believable bluffs.', config: { preset: 'fakeOut', presetLabel: 'FAKE OUT', title: 'Fake Out', rounds: [{ id: 'round-1', prompt: 'Which of these facts is true? Write a believable fake answer.', truth: 'Honey never spoils.', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whoWroteThat', label: 'Who Wrote That?', description: 'Guess which answer belongs to the teacher or target author.', config: { preset: 'whoWroteThat', presetLabel: 'WHO WROTE THAT?', title: 'Who Wrote That?', rounds: [{ id: 'round-1', prompt: 'Which answer was written by the mystery author?', truth: 'Add the real answer', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'confessions', label: 'Confessions', description: 'Separate the real confession from the invented stories.', config: { preset: 'confessions', presetLabel: 'CONFESSIONS', title: 'Confessions', rounds: [{ id: 'round-1', prompt: 'Which confession is real?', truth: 'Add the real confession', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'secretTalent', label: 'Secret Talent', description: 'Find the real talent hidden among decoys.', config: { preset: 'secretTalent', presetLabel: 'SECRET TALENT', title: 'Secret Talent', rounds: [{ id: 'round-1', prompt: 'Which secret talent belongs to the target player?', truth: 'Add the real talent', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } },
  { id: 'whyIsThisHere', label: 'Why Is This Here?', description: 'Guess the true reason an object, image, or detail appears.', config: { preset: 'whyIsThisHere', presetLabel: 'WHY IS THIS HERE?', title: 'Why Is This Here?', rounds: [{ id: 'round-1', prompt: 'Why is this object in the scene?', truth: 'Add the real reason', points: 100 }], requireModeration: true, votingSeconds: 30, bluffPoints: 50, truthPoints: 100 } }
];

export const DRAWING_PRESETS: ActivityPresetTemplate[] = [
  { id: 'doodle', label: 'Doodle', description: 'Draw a quick prompt and reveal the anonymous gallery.', config: { preset: 'doodle', presetLabel: 'DOODLE', title: 'Doodle', prompts: [{ id: 'prompt-1', prompt: 'Draw something surprising.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'drawAndVote', label: 'Draw & Vote', description: 'Let the room choose the drawing that best answers the prompt.', config: { preset: 'drawAndVote', presetLabel: 'DRAW & VOTE', title: 'Draw & Vote', prompts: [{ id: 'prompt-1', prompt: 'Draw the best symbol for teamwork.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'mascotMaker', label: 'Mascot Maker', description: 'Invent a mascot for a group, class, or team.', config: { preset: 'mascotMaker', presetLabel: 'MASCOT MAKER', title: 'Mascot Maker', prompts: [{ id: 'prompt-1', prompt: 'Design a mascot for a team that never gives up.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'logoDisaster', label: 'Logo Disaster', description: 'Create the worst logo for an ordinary idea.', config: { preset: 'logoDisaster', presetLabel: 'LOGO DISASTER', title: 'Logo Disaster', prompts: [{ id: 'prompt-1', prompt: 'Design a logo for the least organized club in school.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'inventionLab', label: 'Invention Lab', description: 'Sketch a new invention and let the room name its purpose.', config: { preset: 'inventionLab', presetLabel: 'INVENTION LAB', title: 'Invention Lab', prompts: [{ id: 'prompt-1', prompt: 'Draw an invention that solves a tiny everyday problem.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'drawTheDescription', label: 'Draw the Description', description: 'Turn a teacher-authored description into a visual guess.', config: { preset: 'drawTheDescription', presetLabel: 'DRAW THE DESCRIPTION', title: 'Draw the Description', prompts: [{ id: 'prompt-1', prompt: 'Draw a place where you would never want to lose your keys.', points: 100 }], requireModeration: true, votingSeconds: 30 } },
  { id: 'telephoneDraw', label: 'Telephone Draw', description: 'Pass a phrase through alternating drawings and descriptions, then replay the whole chain.', config: { preset: 'telephoneDraw', presetLabel: 'TELEPHONE DRAW', title: 'Telephone Draw', telephoneChain: true, chainSteps: [{ id: 'step-1', kind: 'drawing', label: 'Draw it', prompt: 'Draw this phrase without using words.', phrase: 'A penguin running a lemonade stand' }, { id: 'step-2', kind: 'description', label: 'Describe it', prompt: 'Describe the drawing in one sentence.' }, { id: 'step-3', kind: 'drawing', label: 'Draw the description', prompt: 'Draw the sentence you just received.' }, { id: 'step-4', kind: 'description', label: 'Final guess', prompt: 'What do you think the drawing shows?' }], requireModeration: true, votingSeconds: 20 } }
];

export const SURVEY_PRESETS: ActivityPresetTemplate[] = [
  {
    id: 'surveyShowdown',
    label: 'Survey Showdown',
    description: 'Reveal ranked answers with strikes, buzzers, and a team score.',
    config: { preset: 'surveyShowdown', presetLabel: 'SURVEY SHOWDOWN', title: 'Survey Showdown', teamPlay: true, stealEnabled: true, strikesToSteal: 3, questions: [{ id: 'question-1', prompt: 'Name something people bring to a group meeting.', answers: [{ id: 'answer-1', rank: 1, text: 'Notebook', points: 40 }, { id: 'answer-2', rank: 2, text: 'Drink', points: 30 }, { id: 'answer-3', rank: 3, text: 'Questions', points: 20 }, { id: 'answer-4', rank: 4, text: 'A friend', points: 10 }] }] }
  },
  {
    id: 'topFive',
    label: 'Top Five',
    description: 'Build a ranked board of five teacher-authored answers.',
    config: { preset: 'topFive', presetLabel: 'TOP FIVE', title: 'Top Five', questions: [{ id: 'question-1', prompt: 'What are five things that help a team succeed?', answers: [{ id: 'answer-1', rank: 1, text: 'Listen', points: 40 }, { id: 'answer-2', rank: 2, text: 'Practice', points: 30 }, { id: 'answer-3', rank: 3, text: 'Encourage', points: 20 }, { id: 'answer-4', rank: 4, text: 'Plan', points: 10 }, { id: 'answer-5', rank: 5, text: 'Celebrate', points: 5 }] }] }
  },
  {
    id: 'topAnswer',
    label: 'Top Answer',
    description: 'Put the biggest answer on the board and let teams hunt for it.',
    config: { preset: 'topAnswer', presetLabel: 'TOP ANSWER', title: 'Top Answer', questions: [{ id: 'question-1', prompt: 'What is the top answer to today’s question?', answers: [{ id: 'answer-1', rank: 1, text: 'Add the top answer', points: 100 }, { id: 'answer-2', rank: 2, text: 'Add another answer', points: 50 }, { id: 'answer-3', rank: 3, text: 'Add a third answer', points: 25 }] }] }
  },
  {
    id: 'bottomOfTheBarrel',
    label: 'Bottom of the Barrel',
    description: 'Make the lowest-ranked answer the surprising target.',
    config: { preset: 'bottomOfTheBarrel', presetLabel: 'BOTTOM OF THE BARREL', title: 'Bottom of the Barrel', questions: [{ id: 'question-1', prompt: 'What is the least expected answer to this question?', answers: [{ id: 'answer-1', rank: 1, text: 'Most common answer', points: 10 }, { id: 'answer-2', rank: 2, text: 'Less common answer', points: 25 }, { id: 'answer-3', rank: 3, text: 'Bottom-of-the-barrel answer', points: 50 }] }] }
  }
];

export const ORDERING_PRESETS: ActivityPresetTemplate[] = [
  { id: 'orderUp', label: 'Order Up', description: 'Arrange steps or ideas into the correct sequence.', config: { preset: 'orderUp', presetLabel: 'ORDER UP', title: 'Order Up', rounds: [{ id: 'round-1', prompt: 'Put these steps in the best order.', items: [{ id: 'item-1', label: 'Start' }, { id: 'item-2', label: 'Try' }, { id: 'item-3', label: 'Reflect' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'timeline', label: 'Timeline', description: 'Place events, discoveries, or milestones in chronological order.', config: { preset: 'timeline', presetLabel: 'TIMELINE', title: 'Timeline', rounds: [{ id: 'round-1', prompt: 'Put these events in chronological order.', items: [{ id: 'item-1', label: 'First event' }, { id: 'item-2', label: 'Second event' }, { id: 'item-3', label: 'Third event' }, { id: 'item-4', label: 'Fourth event' }], correctOrder: ['item-1', 'item-2', 'item-3', 'item-4'], points: 100 }] } },
  { id: 'rankIt', label: 'Rank It', description: 'Rank a set of choices against a teacher-defined standard.', config: { preset: 'rankIt', presetLabel: 'RANK IT', title: 'Rank It', rounds: [{ id: 'round-1', prompt: 'Rank these ideas from strongest to weakest.', items: [{ id: 'item-1', label: 'Strongest' }, { id: 'item-2', label: 'Middle' }, { id: 'item-3', label: 'Weakest' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'verseScramble', label: 'Verse Scramble', description: 'Reassemble a verse, quote, instruction, or key sentence.', config: { preset: 'verseScramble', presetLabel: 'VERSE SCRAMBLE', title: 'Verse Scramble', rounds: [{ id: 'round-1', prompt: 'Put the words or phrases back in the correct order.', items: [{ id: 'item-1', label: 'First phrase' }, { id: 'item-2', label: 'Next phrase' }, { id: 'item-3', label: 'Final phrase' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'missingStep', label: 'Missing Step', description: 'Order a process and identify what belongs before or after each step.', config: { preset: 'missingStep', presetLabel: 'MISSING STEP', title: 'Missing Step', rounds: [{ id: 'round-1', prompt: 'Place these process steps in order, then discuss what is missing.', items: [{ id: 'item-1', label: 'Prepare' }, { id: 'item-2', label: 'Act' }, { id: 'item-3', label: 'Review' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'causeAndEffect', label: 'Cause & Effect', description: 'Connect a chain of causes and outcomes by putting them in sequence.', config: { preset: 'causeAndEffect', presetLabel: 'CAUSE & EFFECT', title: 'Cause & Effect', rounds: [{ id: 'round-1', prompt: 'Put this cause-and-effect chain in the best order.', items: [{ id: 'item-1', label: 'Cause' }, { id: 'item-2', label: 'Change' }, { id: 'item-3', label: 'Effect' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'sortingHat', label: 'Sorting Hat', description: 'Sort a list by a teacher-defined priority or decision rule.', config: { preset: 'sortingHat', presetLabel: 'SORTING HAT', title: 'Sorting Hat', rounds: [{ id: 'round-1', prompt: 'Sort these choices from best fit to least fit.', items: [{ id: 'item-1', label: 'Best fit' }, { id: 'item-2', label: 'Possible fit' }, { id: 'item-3', label: 'Least fit' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'oddOneOut', label: 'Odd One Out', description: 'Place the odd item where the host-defined pattern makes it easiest to spot.', config: { preset: 'oddOneOut', presetLabel: 'ODD ONE OUT', title: 'Odd One Out', rounds: [{ id: 'round-1', prompt: 'Arrange these items, then explain which one breaks the pattern.', items: [{ id: 'item-1', label: 'Related item' }, { id: 'item-2', label: 'Related item' }, { id: 'item-3', label: 'Odd one out' }], correctOrder: ['item-1', 'item-2', 'item-3'], points: 100 }] } },
  { id: 'matchUp', label: 'Match-Up', description: 'Connect the items that belong together and score every correct pair.', config: { preset: 'matchUp', presetLabel: 'MATCH-UP', title: 'Match-Up', interactionMode: 'matching', rounds: [{ id: 'round-1', prompt: 'Match each animal to its home.', pairs: [{ id: 'pair-1', left: 'Penguin', right: 'Antarctica' }, { id: 'pair-2', left: 'Camel', right: 'Desert' }, { id: 'pair-3', left: 'Otter', right: 'River' }], points: 100 }] } },
  { id: 'connections', label: 'Connections', description: 'Sort a mixed set of clues into groups that share a hidden connection.', config: { preset: 'connections', presetLabel: 'CONNECTIONS', title: 'Connections', interactionMode: 'grouping', rounds: [{ id: 'round-1', prompt: 'Sort these clues into their hidden animal groups.', items: [{ id: 'item-1', label: 'Paw' }, { id: 'item-2', label: 'Whisker' }, { id: 'item-3', label: 'Feather' }, { id: 'item-4', label: 'Beak' }, { id: 'item-5', label: 'Hoof' }, { id: 'item-6', label: 'Mane' }], groups: [{ id: 'group-1', label: 'Cat clues', itemIds: ['item-1', 'item-2'] }, { id: 'group-2', label: 'Bird clues', itemIds: ['item-3', 'item-4'] }, { id: 'group-3', label: 'Horse clues', itemIds: ['item-5', 'item-6'] }], points: 100 }] } }
];

export const WORD_PRESETS: ActivityPresetTemplate[] = [
  { id: 'categoryBlitz', label: 'Category Blitz', description: 'Submit as many approved answers as possible before time runs out.', config: { preset: 'categoryBlitz', presetLabel: 'CATEGORY BLITZ', title: 'Category Blitz', rounds: [{ id: 'round-1', prompt: 'Name as many things as you can that belong in this category.', category: 'Teacher category', points: 10, seconds: 45 }], requireModeration: true, allowDuplicates: false, maxWords: 30 } },
  { id: 'nameFive', label: 'Name Five', description: 'Race to contribute five answers to a focused prompt.', config: { preset: 'nameFive', presetLabel: 'NAME FIVE', title: 'Name Five', rounds: [{ id: 'round-1', prompt: 'Name five examples that fit the prompt.', category: 'Five things', points: 20, seconds: 45 }], requireModeration: true, allowDuplicates: false, maxWords: 5 } },
  { id: 'alphabetChallenge', label: 'Alphabet Challenge', description: 'Build a category list while working through the alphabet.', config: { preset: 'alphabetChallenge', presetLabel: 'ALPHABET CHALLENGE', title: 'Alphabet Challenge', rounds: [{ id: 'round-1', prompt: 'Submit one answer for as many letters as possible.', category: 'A–Z challenge', points: 15, seconds: 60 }], requireModeration: true, allowDuplicates: false, alphabetMode: true } },
  { id: 'lastOneStanding', label: 'Last One Standing', description: 'Keep the round moving with unique answers and a clear timeout.', config: { preset: 'lastOneStanding', presetLabel: 'LAST ONE STANDING', title: 'Last One Standing', rounds: [{ id: 'round-1', prompt: 'Give one unique answer before the round moves on.', category: 'Stay in the game', points: 25, seconds: 15 }], requireModeration: true, allowDuplicates: false, turnBased: true, eliminateOnDuplicate: true } },
  { id: 'chainReaction', label: 'Chain Reaction', description: 'Use the previous answer as inspiration for the next word.', config: { preset: 'chainReaction', presetLabel: 'CHAIN REACTION', title: 'Chain Reaction', rounds: [{ id: 'round-1', prompt: 'Submit a word connected to the previous answer.', category: 'Word chain', points: 15, seconds: 30 }], requireModeration: true, allowDuplicates: false, turnBased: true } },
  { id: 'wordAssociation', label: 'Word Association', description: 'Build a fast, teacher-guided stream of connected words.', config: { preset: 'wordAssociation', presetLabel: 'WORD ASSOCIATION', title: 'Word Association', rounds: [{ id: 'round-1', prompt: 'What word comes to mind first?', category: 'Association', points: 10, seconds: 30 }], requireModeration: true, allowDuplicates: false } },
  { id: 'wordStorm', label: 'Word Storm', description: 'Reveal repeated words at larger sizes in a shared room cloud.', config: { preset: 'wordStorm', presetLabel: 'WORD STORM', title: 'Word Storm', rounds: [{ id: 'round-1', prompt: 'Name something that helps a team work well.', category: 'Teamwork', points: 10, seconds: 45 }], requireModeration: true, allowDuplicates: false } },
  { id: 'oneWordTooFar', label: 'One Word Too Far', description: 'Find the answer that stretches the category past its safe boundary.', config: { preset: 'oneWordTooFar', presetLabel: 'ONE WORD TOO FAR', title: 'One Word Too Far', rounds: [{ id: 'round-1', prompt: 'Submit a word that almost fits, but goes one step too far.', category: 'Boundary test', points: 20, seconds: 30 }], requireModeration: true, allowDuplicates: false } }
];

export const MATCH_PRESETS: ActivityPresetTemplate[] = [
  { id: 'matchMinds', label: 'Match Minds', description: 'See who predicts the selected player’s private answer.', config: { preset: 'matchMinds', presetLabel: 'MATCH MINDS', title: 'Match Minds', rounds: [{ id: 'round-1', prompt: 'Which would you choose for a free afternoon?', options: ['Read', 'Explore', 'Create', 'Rest'], points: 100 }] } },
  { id: 'sameBrain', label: 'Same Brain', description: 'Find the players who think exactly like the target.', config: { preset: 'sameBrain', presetLabel: 'SAME BRAIN', title: 'Same Brain', rounds: [{ id: 'round-1', prompt: 'Which answer would the target choose?', options: ['Option A', 'Option B', 'Option C', 'Option D'], points: 100 }] } },
  { id: 'knowYourLeader', label: 'Know Your Leader', description: 'Let the group predict the leader’s answer and compare the room.', config: { preset: 'knowYourLeader', presetLabel: 'KNOW YOUR LEADER', title: 'Know Your Leader', rounds: [{ id: 'round-1', prompt: 'What will the leader choose?', options: ['Teach', 'Explore', 'Create', 'Rest'], points: 100 }] } },
  { id: 'friendMatch', label: 'Friend Match', description: 'Test how well friends predict one another’s choices.', config: { preset: 'friendMatch', presetLabel: 'FRIEND MATCH', title: 'Friend Match', rounds: [{ id: 'round-1', prompt: 'Which option would your friend pick?', options: ['Option A', 'Option B', 'Option C'], points: 100 }] } },
  { id: 'newlywedGame', label: 'Newlywed Game', description: 'Use paired players or teams for a lighthearted matching round.', config: { preset: 'newlywedGame', presetLabel: 'NEWLYWED GAME', title: 'Newlywed Game', rounds: [{ id: 'round-1', prompt: 'Which answer will your partner choose?', options: ['Early', 'On time', 'Late'], points: 100 }] } },
  { id: 'howWellDoYouKnowMe', label: 'How Well Do You Know Me?', description: 'Turn teacher-authored questions into a friendly prediction game.', config: { preset: 'howWellDoYouKnowMe', presetLabel: 'HOW WELL DO YOU KNOW ME?', title: 'How Well Do You Know Me?', rounds: [{ id: 'round-1', prompt: 'Which answer best describes the target?', options: ['Option A', 'Option B', 'Option C', 'Option D'], points: 100 }] } },
  { id: 'guessMyAnswer', label: 'Guess My Answer', description: 'Invite the room to predict a target player’s next answer.', config: { preset: 'guessMyAnswer', presetLabel: 'GUESS MY ANSWER', title: 'Guess My Answer', rounds: [{ id: 'round-1', prompt: 'What answer is the target about to choose?', options: ['Choice A', 'Choice B'], points: 100 }] } }
];

export const MEDIA_REVEAL_PRESETS: ActivityPresetTemplate[] = [
  { id: 'mysteryImage', label: 'Mystery Image', description: 'Reveal a teacher-selected image one stage at a time.', config: { preset: 'mysteryImage', presetLabel: 'MYSTERY IMAGE', title: 'Mystery Image', imageUrl: '', style: 'blur', totalStages: 5, prompt: 'Can you guess what it is?', answer: '' } },
  { id: 'zoomedIn', label: 'Zoomed In', description: 'Start close on a detail, then pull back to reveal the whole image.', config: { preset: 'zoomedIn', presetLabel: 'ZOOMED IN', title: 'Zoomed In', imageUrl: '', style: 'zoom', totalStages: 6, prompt: 'What are we looking at?', answer: '' } },
  { id: 'blurReveal', label: 'Blur Reveal', description: 'Use a clean progressive blur for photos, objects, or lesson visuals.', config: { preset: 'blurReveal', presetLabel: 'BLUR REVEAL', title: 'Blur Reveal', imageUrl: '', style: 'blur', totalStages: 8, prompt: 'What is hidden in the image?', answer: '' } },
  { id: 'silhouette', label: 'Silhouette', description: 'Turn the hidden image into a dramatic silhouette before the reveal.', config: { preset: 'silhouette', presetLabel: 'SILHOUETTE', title: 'Silhouette', imageUrl: '', style: 'silhouette', totalStages: 5, prompt: 'Who or what is this shape?', answer: '' } },
  { id: 'missingPiece', label: 'Missing Piece', description: 'Conceal the edges of an image and reveal more of the scene each step.', config: { preset: 'missingPiece', presetLabel: 'MISSING PIECE', title: 'Missing Piece', imageUrl: '', style: 'crop', totalStages: 6, prompt: 'What part of the scene is missing?', answer: '' } },
  { id: 'whatsDifferent', label: "What's Different?", description: 'Compare two scenes on the TV and spot the teacher-authored change.', config: { preset: 'whatsDifferent', presetLabel: "WHAT'S DIFFERENT?", title: "What's Different?", mediaMode: 'difference', imageUrl: '', comparisonImageUrl: '', prompt: 'Which detail changed between the two safari scenes?', answer: 'Add the changed detail in the editor.' } },
  { id: 'flashFrame', label: 'Flash Frame', description: 'Use a short reveal ladder for quick observation and memory rounds.', config: { preset: 'flashFrame', presetLabel: 'FLASH FRAME', title: 'Flash Frame', imageUrl: '', style: 'pixel', totalStages: 3, prompt: 'What detail did you notice?', answer: '' } },
  { id: 'picturePuzzler', label: 'Picture Puzzler', description: 'Pair a visual clue with a teacher-authored answer or lesson connection.', config: { preset: 'picturePuzzler', presetLabel: 'PICTURE PUZZLER', title: 'Picture Puzzler', imageUrl: '', style: 'pixel', totalStages: 7, prompt: 'What lesson idea does this picture represent?', answer: '' } },
  { id: 'freezeFrame', label: 'Freeze Frame', description: 'Reveal a paused visual gradually and ask what happens next.', config: { preset: 'freezeFrame', presetLabel: 'FREEZE FRAME', title: 'Freeze Frame', imageUrl: '', style: 'blur', totalStages: 5, prompt: 'What happens next?', answer: '' } },
  { id: 'emojiDecode', label: 'Emoji Decode', description: 'Turn a short emoji clue into a phrase, animal fact, or lesson connection.', config: { preset: 'emojiDecode', presetLabel: 'EMOJI DECODE', title: 'Emoji Decode', mediaMode: 'emoji', emojiClue: '🐢🏁', prompt: 'What phrase do these emojis describe?', answer: 'Slow and steady wins the race.', hint: 'The tortoise is not in a hurry.' } },
  { id: 'rebusRush', label: 'Rebus Rush', description: 'Read symbols and words together to solve a fast visual phrase puzzle.', config: { preset: 'rebusRush', presetLabel: 'REBUS RUSH', title: 'Rebus Rush', mediaMode: 'rebus', rebusClue: '🦊 + 🕳️', prompt: 'Put the two clues together.', answer: 'Foxhole', hint: 'It is a hiding place.' } },
  { id: 'memoryGrid', label: 'Memory Grid', description: 'Flash a grid of hidden cards, then reveal selected tiles as the room remembers what it saw.', config: { preset: 'memoryGrid', presetLabel: 'MEMORY GRID', title: 'Memory Grid', mediaMode: 'memoryGrid', prompt: 'Remember what you see, then find the matching card.', memorySeconds: 8, memoryCards: [{ id: 'card-1', label: '🐘', match: 'pair-a' }, { id: 'card-2', label: '🦁', match: 'pair-b' }, { id: 'card-3', label: '🐘', match: 'pair-a' }, { id: 'card-4', label: '🦁', match: 'pair-b' }, { id: 'card-5', label: '🦊', match: 'pair-c' }, { id: 'card-6', label: '🦊', match: 'pair-c' }] } },
  { id: 'soundCheck', label: 'Sound Check', description: 'Play a short audio clue and let the room identify it or connect it to the lesson.', config: { preset: 'soundCheck', presetLabel: 'SOUND CHECK', title: 'Sound Check', mediaMode: 'audio', audioUrl: '', audioMediaId: '', audioDurationSeconds: 3, prompt: 'What animal or scene made that sound?', answer: '' } },
  { id: 'soundBite', label: 'Sound Bite', description: 'Use a teacher-selected sound bite as a fast recognition round.', config: { preset: 'soundBite', presetLabel: 'SOUND BITE', title: 'Sound Bite', mediaMode: 'audio', audioUrl: '', audioMediaId: '', audioDurationSeconds: 5, prompt: 'Name the sound before the reveal.', answer: '' } },
  { id: 'backwardsAudio', label: 'Backwards Audio', description: 'Play an audio clue in reverse when the browser can transform it locally, or use a teacher-provided reversed clip.', config: { preset: 'backwardsAudio', presetLabel: 'BACKWARDS AUDIO', title: 'Backwards Audio', mediaMode: 'audio', audioTransform: 'reverse', audioUrl: '', audioMediaId: '', audioDurationSeconds: 5, prompt: 'What does this backwards sound become?', answer: '' } },
  { id: 'oneSecondChallenge', label: 'One Second Challenge', description: 'Play only a tiny slice of a sound or song and reward the fastest correct guess.', config: { preset: 'oneSecondChallenge', presetLabel: 'ONE SECOND CHALLENGE', title: 'One Second Challenge', mediaMode: 'audio', audioUrl: '', audioMediaId: '', audioDurationSeconds: 1, prompt: 'Identify the one-second clue.', answer: '' } },
  { id: 'whatHappensNext', label: 'What Happens Next?', description: 'Pause a photo or video at a meaningful moment and reveal the outcome after guesses.', config: { preset: 'whatHappensNext', presetLabel: 'WHAT HAPPENS NEXT?', title: 'What Happens Next?', imageUrl: '', style: 'blur', totalStages: 3, prompt: 'What happens next?', answer: '' } }
];

export const STAGE_PRESETS: ActivityPresetTemplate[] = [
  { id: 'beatTheClock', label: 'Beat the Clock', description: 'Complete a host-led challenge before the timer runs out.', config: { preset: 'beatTheClock', presetLabel: 'BEAT THE CLOCK', title: 'Beat the Clock', challenges: [{ id: 'challenge-1', title: 'Build a paper tower', instructions: 'Build the tallest free-standing tower you can before the clock stops.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'minuteToWinIt', label: 'Minute to Win It', description: 'Turn a simple physical task into a quick, replayable contest.', config: { preset: 'minuteToWinIt', presetLabel: 'MINUTE TO WIN IT', title: 'Minute to Win It', challenges: [{ id: 'challenge-1', title: 'Move ten items using only a spoon', instructions: 'Move the items from one container to another before time expires.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'teachItBack', label: 'Teach It Back', description: 'Ask a contestant to explain a lesson idea clearly to the room.', config: { preset: 'teachItBack', presetLabel: 'TEACH IT BACK', title: 'Teach It Back', challenges: [{ id: 'challenge-1', title: 'Explain one idea in 30 seconds', instructions: 'Teach the room the key idea using an example anyone can understand.', seconds: 30, points: 100, failPoints: 0 }] } },
  { id: 'bestExplanation', label: 'Best Explanation', description: 'Compare explanations and let the host reward clarity and creativity.', config: { preset: 'bestExplanation', presetLabel: 'BEST EXPLANATION', title: 'Best Explanation', challenges: [{ id: 'challenge-1', title: 'Explain a tricky idea simply', instructions: 'Give the clearest explanation you can, then let the host make the ruling.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'scenarioJudge', label: 'Scenario Judge', description: 'Have a contestant respond to a teacher-authored real-world scenario.', config: { preset: 'scenarioJudge', presetLabel: 'SCENARIO JUDGE', title: 'Scenario Judge', challenges: [{ id: 'challenge-1', title: 'What would you do next?', instructions: 'Respond to the scenario and explain why your choice is responsible.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'exampleNonExample', label: 'Example / Non-Example', description: 'Classify and defend an example using the lesson’s criteria.', config: { preset: 'exampleNonExample', presetLabel: 'EXAMPLE / NON-EXAMPLE', title: 'Example / Non-Example', challenges: [{ id: 'challenge-1', title: 'Make the call', instructions: 'Decide whether the teacher’s example fits, then justify the decision.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'unnecessaryDebate', label: 'Unnecessary Debate', description: 'Make a playful argument for a low-stakes position.', config: { preset: 'unnecessaryDebate', presetLabel: 'UNNECESSARY DEBATE', title: 'Unnecessary Debate', challenges: [{ id: 'challenge-1', title: 'Defend your very strong opinion', instructions: 'Make the best case you can for a harmless, low-stakes position.', seconds: 60, points: 100, failPoints: 0 }] } },
  { id: 'courtroom', label: 'Courtroom', description: 'Present a short case and let the host rule on the argument.', config: { preset: 'courtroom', presetLabel: 'COURTROOM', title: 'Courtroom', challenges: [{ id: 'challenge-1', title: 'Make your case', instructions: 'Present evidence, respond to the prompt, and finish with a clear conclusion.', seconds: 90, points: 100, failPoints: 0 }] } },
  { id: 'sellMeThis', label: 'Sell Me This', description: 'Pitch an ordinary object as the answer to an unusual need.', config: { preset: 'sellMeThis', presetLabel: 'SELL ME THIS', title: 'Sell Me This', challenges: [{ id: 'challenge-1', title: 'Pitch this ordinary object', instructions: 'Give the room one compelling reason to want the object.', seconds: 45, points: 100, failPoints: 0 }] } },
  { id: 'poseMatch', label: 'Pose Match', description: 'Match a teacher or team pose under a visible time limit.', config: { preset: 'poseMatch', presetLabel: 'POSE MATCH', title: 'Pose Match', challenges: [{ id: 'challenge-1', title: 'Copy the pose', instructions: 'Match the host’s pose as closely as possible before the timer stops.', seconds: 30, points: 100, failPoints: 0 }] } },
  { id: 'photoHunt', label: 'Photo Hunt', description: 'Send a contestant or team to find a safe, teacher-defined visual example.', config: { preset: 'photoHunt', presetLabel: 'PHOTO HUNT', title: 'Photo Hunt', challenges: [{ id: 'challenge-1', title: 'Find the requested example', instructions: 'Find the teacher’s requested example and return before time expires.', seconds: 120, points: 100, failPoints: 0 }] } }
];

/**
 * Physical-room activities share the same host-led runtime. Keeping their
 * templates here makes them discoverable from the same library chooser as
 * phone-based games without creating another selector or game system.
 */
export const PHYSICAL_ROOM_PRESETS: ActivityPresetTemplate[] = [
  { id: 'fourCorners', label: 'Four Corners', description: 'Choose a corner, move with purpose, and compare the room’s choices.', config: { preset: 'fourCorners', presetLabel: 'FOUR CORNERS', title: 'Four Corners', rounds: [{ id: 'round-1', title: 'Four Corners', instructions: 'Choose a corner of the room. When the timer ends, the host reveals the prompt.', choices: ['North', 'South', 'East', 'West'], seconds: 30, revealText: 'Show your corner and explain your choice.' }] } },
  { id: 'standSit', label: 'Stand / Sit', description: 'Stand when the statement fits; sit when it does not.', config: { preset: 'standSit', presetLabel: 'STAND / SIT', title: 'Stand / Sit', rounds: [{ id: 'round-1', title: 'Stand / Sit', instructions: 'Stand if the statement is true for you. Sit if it is not.', choices: ['Stand', 'Sit'], seconds: 20, revealText: 'Look around the room and notice the split.' }] } },
  { id: 'moveIf', label: 'Move If…', description: 'Move across the room when the prompt describes you.', config: { preset: 'moveIf', presetLabel: 'MOVE IF…', title: 'Move If…', rounds: [{ id: 'round-1', title: 'Move If…', instructions: 'Move to the marked side of the room if the statement applies to you.', choices: ['Move', 'Stay'], seconds: 20, revealText: 'The room has made its choice.' }] } },
  { id: 'humanSpectrum', label: 'Human Spectrum', description: 'Place yourself anywhere between two strong opinions.', config: { preset: 'humanSpectrum', presetLabel: 'HUMAN SPECTRUM', title: 'Human Spectrum', rounds: [{ id: 'round-1', title: 'Human Spectrum', instructions: 'Place yourself along the spectrum from one end of the room to the other.', choices: ['Strongly disagree', 'Disagree', 'Agree', 'Strongly agree'], seconds: 35, revealText: 'Compare where everyone landed and invite a few voices.' }] } },
  { id: 'lineUp', label: 'Line Up', description: 'Build a silent human timeline or ranking.', config: { preset: 'lineUp', presetLabel: 'LINE UP', title: 'Line Up', rounds: [{ id: 'round-1', title: 'Line Up', instructions: 'Without talking, line up according to the host’s category.', choices: [], seconds: 45, revealText: 'Freeze the line and check the order.' }] } },
  { id: 'findSomeone', label: 'Find Someone Who', description: 'Find a person who matches the prompt before time runs out.', config: { preset: 'findSomeone', presetLabel: 'FIND SOMEONE WHO', title: 'Find Someone Who', rounds: [{ id: 'round-1', title: 'Find Someone Who', instructions: 'Find someone in the room who matches the host’s prompt before the timer ends.', choices: [], seconds: 45, revealText: 'Point out a few surprising matches.' }] } },
  { id: 'simonSays', label: 'Simon Says Controller', description: 'Use the TV and host controller to run a fast Simon Says round.', config: { preset: 'simonSays', presetLabel: 'SIMON SAYS CONTROLLER', title: 'Simon Says Controller', rounds: [{ id: 'round-1', title: 'Simon Says Controller', instructions: 'Follow the command only when it begins with “Simon says.”', choices: ['Simon says', 'Freeze'], seconds: 30, revealText: 'The host checks who is still in.' }] } },
  { id: 'freezeDance', label: 'Freeze Dance Controller', description: 'Dance, freeze, and keep the room watching the TV for the next cue.', config: { preset: 'freezeDance', presetLabel: 'FREEZE DANCE CONTROLLER', title: 'Freeze Dance Controller', rounds: [{ id: 'round-1', title: 'Freeze Dance Controller', instructions: 'Move while the music or host cue is active. Freeze instantly when it stops.', choices: ['Dance', 'Freeze'], seconds: 45, revealText: 'Celebrate the last movers standing.' }] } },
  { id: 'challengeWheel', label: 'Challenge Wheel', description: 'Randomize a quick physical challenge, then run it on the clock.', config: { preset: 'challengeWheel', presetLabel: 'CHALLENGE WHEEL', title: 'Challenge Wheel', rounds: [{ id: 'round-1', title: 'Challenge Wheel', instructions: 'The host chooses or randomizes a quick physical challenge for the room.', choices: ['Challenge A', 'Challenge B', 'Challenge C'], seconds: 30, revealText: 'Reveal the challenge result.' }] } },
  { id: 'relayBoard', label: 'Relay Board', description: 'Send players through a visible team relay challenge.', config: { preset: 'relayBoard', presetLabel: 'RELAY BOARD', title: 'Relay Board', rounds: [{ id: 'round-1', title: 'Relay Board', instructions: 'Teams send one player at a time to complete the visible relay task.', choices: ['Team 1', 'Team 2'], seconds: 60, revealText: 'Award the relay round.' }] } },
  { id: 'scavengerHunt', label: 'Scavenger Hunt', description: 'Search for a safe, teacher-defined item and return before the timer.', config: { preset: 'scavengerHunt', presetLabel: 'SCAVENGER HUNT', title: 'Scavenger Hunt', rounds: [{ id: 'round-1', title: 'Scavenger Hunt', instructions: 'Find or photograph the requested item and return before time runs out.', choices: [], seconds: 60, revealText: 'Show what each team found.' }] } },
  { id: 'headsOrTails', label: 'Heads or Tails', description: 'Pick a side, hold it, and reveal the result together.', config: { preset: 'headsOrTails', presetLabel: 'HEADS OR TAILS', title: 'Heads or Tails', rounds: [{ id: 'round-1', title: 'Heads or Tails', instructions: 'Choose heads or tails, then hold your choice while the host reveals the result.', choices: ['Heads', 'Tails'], seconds: 15, revealText: 'Reveal the winning side.' }] } },
  { id: 'rockPaperScissors', label: 'Rock Paper Scissors Royale', description: 'Pair up, play a round, and let winners advance toward the center.', config: { preset: 'rockPaperScissors', presetLabel: 'ROCK PAPER SCISSORS ROYALE', title: 'Rock Paper Scissors Royale', rounds: [{ id: 'round-1', title: 'Rock Paper Scissors Royale', instructions: 'Pair up, play one round, and winners move toward the center.', choices: ['Rock', 'Paper', 'Scissors'], seconds: 20, revealText: 'Winners advance; reset for the next wave.' }] } },
  { id: 'animalRelay', label: 'Animal Relay', description: 'Move like the featured animal while teams race the visible relay clock.', config: { preset: 'animalRelay', presetLabel: 'ANIMAL RELAY', title: 'Animal Relay', rounds: [{ id: 'round-1', title: 'Animal Relay', instructions: 'One player from each team completes the animal movement and tags the next teammate.', choices: ['Penguin waddle', 'Crab walk', 'Kangaroo hops'], seconds: 60, revealText: 'Award the team that completed the relay first.' }] } },
  { id: 'silentLineUp', label: 'Silent Line-Up', description: 'Solve a room-wide ordering challenge without speaking.', config: { preset: 'silentLineUp', presetLabel: 'SILENT LINE-UP', title: 'Silent Line-Up', rounds: [{ id: 'round-1', title: 'Silent Line-Up', instructions: 'Line up by the host’s category without speaking or using phones.', choices: ['Shortest to tallest', 'Oldest to youngest', 'Earliest to latest'], seconds: 60, revealText: 'Check the line and celebrate the silent teamwork.' }] } },
  { id: 'adventure', label: 'Adventure', description: 'Make a room-wide choice and follow the story to its next branch.', config: { preset: 'adventure', presetLabel: 'ADVENTURE', title: 'Animal Adventure', adventure: true, rounds: [{ id: 'node-1', title: 'The Moonlit Trail', instructions: 'Your animal team reaches a fork in the trail. Choose the next move.', choices: ['Follow the pawprints', 'Climb the lookout'], seconds: 30, revealText: 'The trail opens…', branches: { '0': 1, '1': 2 } }, { id: 'node-2', title: 'The Hidden Waterfall', instructions: 'The pawprints lead to a waterfall. What will the team do?', choices: ['Search behind the falls', 'Build a bridge'], seconds: 30, revealText: 'You discover a glowing animal badge.', branches: { '0': 3, '1': 3 } }, { id: 'node-3', title: 'The High Lookout', instructions: 'From the lookout, the team spots two routes across the valley.', choices: ['Call the flock', 'Take the sunny path'], seconds: 30, revealText: 'A friendly guide appears.', branches: { '0': 3, '1': 3 } }, { id: 'node-4', title: 'The Safari Celebration', instructions: 'You made it! Tell the room which animal helped your team most.', choices: [], seconds: 15, revealText: 'The adventure is complete. Give the winning team a roar!' }] } }
];

/** Utility formats stay in the same catalog, even though their runtime is
 * intentionally compact. Wheel remains on the existing legacy wheel type so
 * older definitions keep their reducer and presentation behavior. */
export const WHEEL_PRESETS: ActivityPresetTemplate[] = [
  { id: 'safariSpin', label: 'Safari Spin', description: 'Spin through animal teams, movement prompts, or a teacher-authored prize pool.', config: { preset: 'safariSpin', presetLabel: 'SAFARI SPIN', title: 'Safari Spin', removeWinner: true, spinDurationSeconds: 5, items: [{ id: 'lion', label: 'Lion team', weight: 1, color: '#d88c1e' }, { id: 'penguin', label: 'Penguin waddle', weight: 1, color: '#2563eb' }, { id: 'giraffe', label: 'Giraffe stretch', weight: 1, color: '#b86632' }, { id: 'otter', label: 'Otter high five', weight: 1, color: '#2a6e4a' }] } },
  { id: 'spinChallengeWheel', label: 'Spin Challenge Wheel', description: 'Spin a safe, quick challenge for the room, then run it on the clock.', config: { preset: 'spinChallengeWheel', presetLabel: 'SPIN CHALLENGE WHEEL', title: 'Spin Challenge Wheel', removeWinner: false, items: [{ id: 'paws', label: 'Do ten animal hops', weight: 1 }, { id: 'sound', label: 'Make an animal sound', weight: 1 }, { id: 'statue', label: 'Freeze like a statue', weight: 1 }, { id: 'story', label: 'Tell a ten-second animal story', weight: 1 }] } }
];

export const UTILITY_PRESETS: ActivityPresetTemplate[] = [
  { id: 'coinFlip', label: 'Coin Flip', description: 'Make a fast two-choice decision with an original game-show reveal.', config: { preset: 'coinFlip', presetLabel: 'COIN FLIP', title: 'Animal Coin Flip', utilityType: 'coinFlip', choices: ['Heads', 'Tails'] } },
  { id: 'dice', label: 'Dice', description: 'Roll a server-randomized die for points, order, or a bonus round.', config: { preset: 'dice', presetLabel: 'DICE', title: 'Safari Dice', utilityType: 'dice', diceSides: 6 } },
  { id: 'randomNumber', label: 'Random Number', description: 'Draw a number from a teacher-defined range.', config: { preset: 'randomNumber', presetLabel: 'RANDOM NUMBER', title: 'Mystery Number', utilityType: 'randomNumber', minimum: 1, maximum: 100 } },
  { id: 'randomPerson', label: 'Random Person Picker', description: 'Pick an active participant without storing names in the reusable activity.', config: { preset: 'randomPerson', presetLabel: 'RANDOM PERSON', title: 'Who’s Up Next?', utilityType: 'randomPerson' } },
  { id: 'randomTeam', label: 'Random Team Picker', description: 'Pick one of the live teams for the next challenge.', config: { preset: 'randomTeam', presetLabel: 'RANDOM TEAM', title: 'Which Team Goes First?', utilityType: 'randomTeam' } },
  { id: 'mysteryBoxes', label: 'Mystery Boxes', description: 'Reveal hidden points or animal-themed challenges one box at a time.', config: { preset: 'mysteryBoxes', presetLabel: 'MYSTERY BOXES', title: 'Mystery Safari Boxes', utilityType: 'mysteryBoxes', boxes: [{ id: 'box-1', label: '🐘 Elephant Box', value: 'Choose the next category', points: 50 }, { id: 'box-2', label: '🦊 Fox Box', value: 'Double the next score', points: 100 }, { id: 'box-3', label: '🦉 Owl Box', value: 'Ask for one hint', points: 25 }] } },
  { id: 'challengePicker', label: 'Challenge Picker', description: 'Choose one teacher-authored challenge for the room.', config: { preset: 'challengePicker', presetLabel: 'CHALLENGE PICKER', title: 'Pick a Safari Challenge', utilityType: 'challengePicker', challenges: [{ id: 'challenge-1', label: 'Penguin Waddle', instructions: 'Waddle across the room and back.', points: 50 }, { id: 'challenge-2', label: 'Owl Eyes', instructions: 'Stand perfectly still while the host counts to ten.', points: 50 }, { id: 'challenge-3', label: 'Monkey Memory', instructions: 'Remember and repeat three animal names in order.', points: 100 }] } },
  { id: 'teamGenerator', label: 'Team Generator', description: 'Create balanced or random teams from the live roster.', config: { preset: 'teamGenerator', presetLabel: 'TEAM GENERATOR', title: 'Safari Team Generator', utilityType: 'teamGenerator', teamCount: 2, teamAssignmentMode: 'balanced' } },
  { id: 'countdown', label: 'Countdown', description: 'Run a clear, server-authoritative timer for any room challenge.', config: { preset: 'countdown', presetLabel: 'COUNTDOWN', title: 'Safari Countdown', utilityType: 'countdown', durationSeconds: 60, warningThresholdSeconds: 10 } }
];

export interface ActivityPresetCatalogEntry extends ActivityPresetTemplate {
  type: string;
  category: string;
  icon: string;
  requiresPhones: boolean;
  supportsTeams: boolean;
}

const catalogFrom = (templates: ActivityPresetTemplate[], type: string, category: string, icon: string, requiresPhones: boolean, supportsTeams: boolean): ActivityPresetCatalogEntry[] => templates.map(template => ({
  ...template,
  theme: template.theme || themeForCatalog(category, type),
  type,
  category,
  icon,
  requiresPhones,
  supportsTeams
}));

/** The single teacher-facing catalog for named game formats. */
export const ACTIVITY_PRESET_CATALOG: ActivityPresetCatalogEntry[] = [
  ...catalogFrom(QUIZ_PRESETS, 'trivia', 'knowledge', '🧠', true, true),
  ...catalogFrom(POLL_PRESETS, 'poll', 'polls', '📊', true, true),
  ...catalogFrom(BUZZER_PRESETS, 'buzzer', 'gameShow', '⚡', true, true),
  ...catalogFrom(PUNCHLINE_PRESETS, 'punchline', 'creative', '🎤', true, true),
  ...catalogFrom(FAKE_OUT_PRESETS, 'fakeOut', 'creative', '🃏', true, true),
  ...catalogFrom(DRAWING_PRESETS, 'drawing', 'drawing', '🎨', true, true),
  ...catalogFrom(SURVEY_PRESETS, 'surveyBoard', 'gameShow', '🔔', true, true),
  ...catalogFrom(ORDERING_PRESETS, 'ordering', 'sorting', '🧩', true, true),
  ...catalogFrom(WORD_PRESETS, 'word', 'word', '🔤', true, true),
  ...catalogFrom(MATCH_PRESETS, 'matchPlayer', 'match', '🤝', true, true),
  ...catalogFrom(MEDIA_REVEAL_PRESETS, 'imageReveal', 'media', '🖼️', false, true),
  ...catalogFrom(STAGE_PRESETS, 'stageChallenge', 'stage', '🎬', false, true),
  ...catalogFrom(PHYSICAL_ROOM_PRESETS, 'physicalRoom', 'physical', '🏃', false, true),
  ...catalogFrom(WHEEL_PRESETS, 'wheel', 'utilities', '🎡', false, true),
  ...catalogFrom(UTILITY_PRESETS, 'utility', 'utilities', '🎲', false, true)
];
