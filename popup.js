document.addEventListener('DOMContentLoaded', () => {
  const STORAGE_KEY = 'delimiter-settings-v1';
  const VALID_DELIMITER_VALUES = new Set(['tab', 'semicolon', 'space', 'comma', 'remove', 'custom']);
  const DELIMITER_BY_VALUE = {
    tab: '\t',
    semicolon: ';',
    space: ' ',
    comma: ',',
    remove: ''
  };
  const FIELD_WIDTH = {
    min: 24,
    max: 100,
    horizontalPadding: 12,
    border: 2
  };

  const elements = {
    button: document.getElementById('convertButton'),
    controlsRow: document.getElementById('controlsRow'),
    toggleOptionsButton: document.getElementById('toggleOptionsButton'),
    delimiterOptions: document.getElementById('delimiterOptions'),
    resultContainer: document.getElementById('resultContainer'),
    sourceDelimiter: document.getElementById('sourceDelimiter'),
    targetDelimiter: document.getElementById('targetDelimiter'),
    sourceCustomDelimiter: document.getElementById('sourceCustomDelimiter'),
    targetCustomDelimiter: document.getElementById('targetCustomDelimiter')
  };
  const delimiterPairs = [
    {
      select: elements.sourceDelimiter,
      input: elements.sourceCustomDelimiter,
      selectKey: 'sourceDelimiter',
      inputKey: 'sourceCustomDelimiter'
    },
    {
      select: elements.targetDelimiter,
      input: elements.targetCustomDelimiter,
      selectKey: 'targetDelimiter',
      inputKey: 'targetCustomDelimiter'
    }
  ];

  const widthCanvas = document.createElement('canvas');
  const widthContext = widthCanvas.getContext('2d');

  // Checks whether a delimiter key is one of the supported option values.
  function isValidDelimiterValue(value) {
    return VALID_DELIMITER_VALUES.has(value);
  }

  // Loads persisted delimiter settings from localStorage.
  function loadDelimiterSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed;
    } catch (err) {
      console.error(err);
      return null;
    }
  }

  // Creates the storage payload from the current form controls.
  function getDelimiterSettings() {
    return delimiterPairs.reduce((settings, pair) => {
      settings[pair.selectKey] = pair.select.value;
      settings[pair.inputKey] = pair.input.value;
      return settings;
    }, {});
  }

  // Persists current delimiter selections and custom characters.
  function saveDelimiterSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getDelimiterSettings()));
  }

  // Applies stored settings to UI controls when values are valid.
  function applyDelimiterSettings(settings) {
    if (!settings) return;

    delimiterPairs.forEach((pair) => {
      const storedSelectValue = settings[pair.selectKey];
      const storedInputValue = settings[pair.inputKey];

      if (isValidDelimiterValue(storedSelectValue)) {
        pair.select.value = storedSelectValue;
      }
      if (typeof storedInputValue === 'string') {
        pair.input.value = storedInputValue;
      }

      limitToOneCharacter(pair.input);
    });
  }

  // Shows or hides the options panel and updates button expanded state.
  function setDelimiterOptionsVisible(visible) {
    // Clears legacy accessibility attributes from older popup builds before toggling.
    elements.controlsRow.hidden = false;
    elements.controlsRow.removeAttribute('aria-hidden');
    elements.controlsRow.removeAttribute('inert');
    elements.delimiterOptions.hidden = !visible;
    elements.toggleOptionsButton.setAttribute('aria-expanded', String(visible));
  }

  // Toggles custom delimiter input visibility for a select control.
  function toggleCustomInput(pair) {
    pair.input.hidden = pair.select.value !== 'custom';
  }

  // Syncs both custom delimiter input visibility states.
  function toggleAllCustomInputs() {
    delimiterPairs.forEach(toggleCustomInput);
  }

  // Restricts custom delimiter input to a single Unicode character.
  function limitToOneCharacter(inputEl) {
    const chars = [...inputEl.value];
    if (chars.length > 1) {
      inputEl.value = chars[0];
    }
  }

  // Converts a selected delimiter option into its runtime string value.
  function getDelimiter(pair) {
    return DELIMITER_BY_VALUE[pair.select.value] ?? pair.input.value;
  }

  // Returns true when custom delimiter is selected but no value is provided.
  function isCustomInputMissing(pair) {
    return pair.select.value === 'custom' && pair.input.value === '';
  }

  // Checks whether source and target delimiters resolve to the same value.
  function areDelimitersEqual() {
    const [sourcePair, targetPair] = delimiterPairs;
    if (isCustomInputMissing(sourcePair) || isCustomInputMissing(targetPair)) return false;
    return getDelimiter(sourcePair) === getDelimiter(targetPair);
  }

  // Updates convert button disabled state based on current validation rules.
  function updateConvertButtonState() {
    const hasMissingCustomInput = delimiterPairs.some(isCustomInputMissing);
    elements.button.disabled = hasMissingCustomInput || areDelimitersEqual();
  }

  // Splits input text by selected delimiter, with whitespace-normalized space mode.
  function splitByDelimiter(text, selectValue, delimiter) {
    if (selectValue === 'space') {
      const trimmed = text.trim();
      return trimmed ? trimmed.split(/\s+/) : [];
    }

    return text.split(delimiter);
  }

  // Chooses how values should be shown in result cells for the current target delimiter.
  function getDisplayValues(parts, converted, targetDelimiterValue) {
    if (targetDelimiterValue === '\t') {
      return parts;
    }

    return [converted];
  }

  // Calculates per-cell width from text metrics with min/max bounds.
  function getFieldWidth(value) {
    if (!widthContext) return FIELD_WIDTH.max;

    const style = window.getComputedStyle(elements.resultContainer);
    const fontWeight = style.fontWeight || '400';
    const fontSize = style.fontSize || '12px';
    const fontFamily = style.fontFamily || 'system-ui';
    widthContext.font = `${fontWeight} ${fontSize} ${fontFamily}`;

    const text = value === '' ? ' ' : value;
    const textWidth = Math.ceil(widthContext.measureText(text).width);
    const calculatedWidth = textWidth + FIELD_WIDTH.horizontalPadding + FIELD_WIDTH.border;
    return Math.min(FIELD_WIDTH.max, Math.max(FIELD_WIDTH.min, calculatedWidth));
  }

  // Renders read-only result cells using dynamic width per value.
  function renderFields(values) {
    elements.resultContainer.innerHTML = '';

    values.forEach((value) => {
      const input = document.createElement('input');
      input.className = 'field-input';
      input.readOnly = true;
      input.value = value;
      input.style.width = `${getFieldWidth(value)}px`;
      elements.resultContainer.appendChild(input);
    });
  }

  // Hides and clears all rendered result cells.
  function clearResult() {
    elements.resultContainer.hidden = true;
    elements.resultContainer.innerHTML = '';
  }

  // Reads clipboard, converts delimiters, writes back, and renders preview cells.
  async function convertClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text === '') {
        clearResult();
        return;
      }

      const [sourcePair, targetPair] = delimiterPairs;
      const source = getDelimiter(sourcePair);
      const target = getDelimiter(targetPair);
      const parts = splitByDelimiter(text, sourcePair.select.value, source);

      if (parts.length === 0) {
        clearResult();
        return;
      }

      const converted = source === target ? text : parts.join(target);
      const displayValues = getDisplayValues(parts, converted, target);

      await navigator.clipboard.writeText(converted);
      renderFields(displayValues);
      elements.resultContainer.hidden = false;
    } catch (err) {
      console.error(err);
      clearResult();
    }
  }

  // Handles source/target select changes including focus and persistence.
  function handleDelimiterSelectChange(pair) {
    toggleCustomInput(pair);
    updateConvertButtonState();
    saveDelimiterSettings();
    if (pair.select.value === 'custom') {
      pair.input.focus();
    }
  }

  // Handles custom delimiter input updates and persistence.
  function handleCustomDelimiterInput(pair) {
    limitToOneCharacter(pair.input);
    updateConvertButtonState();
    saveDelimiterSettings();
  }

  function bindDelimiterInputEvents() {
    delimiterPairs.forEach((pair) => {
      pair.select.addEventListener('change', () => {
        handleDelimiterSelectChange(pair);
      });
      pair.input.addEventListener('input', () => {
        handleCustomDelimiterInput(pair);
      });
    });
  }

  function initialize() {
    applyDelimiterSettings(loadDelimiterSettings());
    toggleAllCustomInputs();
    updateConvertButtonState();
    saveDelimiterSettings();
    setDelimiterOptionsVisible(false);
    bindDelimiterInputEvents();

    elements.toggleOptionsButton.addEventListener('click', () => {
      setDelimiterOptionsVisible(elements.delimiterOptions.hidden);
    });
    elements.button.addEventListener('click', convertClipboard);
  }

  initialize();
});
