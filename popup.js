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
    toggleOptionsButton: document.getElementById('toggleOptionsButton'),
    delimiterOptions: document.getElementById('delimiterOptions'),
    resultContainer: document.getElementById('resultContainer'),
    sourceDelimiter: document.getElementById('sourceDelimiter'),
    targetDelimiter: document.getElementById('targetDelimiter'),
    sourceCustomDelimiter: document.getElementById('sourceCustomDelimiter'),
    targetCustomDelimiter: document.getElementById('targetCustomDelimiter')
  };

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

  // Persists current delimiter selections and custom characters.
  function saveDelimiterSettings() {
    const settings = {
      sourceDelimiter: elements.sourceDelimiter.value,
      targetDelimiter: elements.targetDelimiter.value,
      sourceCustomDelimiter: elements.sourceCustomDelimiter.value,
      targetCustomDelimiter: elements.targetCustomDelimiter.value
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  // Applies stored settings to UI controls when values are valid.
  function applyDelimiterSettings(settings) {
    if (!settings) return;

    if (isValidDelimiterValue(settings.sourceDelimiter)) {
      elements.sourceDelimiter.value = settings.sourceDelimiter;
    }
    if (isValidDelimiterValue(settings.targetDelimiter)) {
      elements.targetDelimiter.value = settings.targetDelimiter;
    }

    if (typeof settings.sourceCustomDelimiter === 'string') {
      elements.sourceCustomDelimiter.value = settings.sourceCustomDelimiter;
    }
    if (typeof settings.targetCustomDelimiter === 'string') {
      elements.targetCustomDelimiter.value = settings.targetCustomDelimiter;
    }

    limitToOneCharacter(elements.sourceCustomDelimiter);
    limitToOneCharacter(elements.targetCustomDelimiter);
  }

  // Shows or hides the options panel and updates button expanded state.
  function setDelimiterOptionsVisible(visible) {
    elements.delimiterOptions.hidden = !visible;
    elements.toggleOptionsButton.setAttribute('aria-expanded', String(visible));
  }

  // Toggles custom delimiter input visibility for a select control.
  function toggleCustomInput(selectEl, inputEl) {
    inputEl.hidden = selectEl.value !== 'custom';
  }

  // Syncs both custom delimiter input visibility states.
  function toggleAllCustomInputs() {
    toggleCustomInput(elements.sourceDelimiter, elements.sourceCustomDelimiter);
    toggleCustomInput(elements.targetDelimiter, elements.targetCustomDelimiter);
  }

  // Restricts custom delimiter input to a single Unicode character.
  function limitToOneCharacter(inputEl) {
    const chars = [...inputEl.value];
    if (chars.length > 1) {
      inputEl.value = chars[0];
    }
  }

  // Converts a selected delimiter option into its runtime string value.
  function getDelimiter(selectEl, inputEl) {
    return DELIMITER_BY_VALUE[selectEl.value] ?? inputEl.value;
  }

  // Returns true when custom delimiter is selected but no value is provided.
  function isCustomInputMissing(selectEl, inputEl) {
    return selectEl.value === 'custom' && inputEl.value === '';
  }

  // Checks whether source and target delimiters resolve to the same value.
  function areDelimitersEqual() {
    if (isCustomInputMissing(elements.sourceDelimiter, elements.sourceCustomDelimiter)) return false;
    if (isCustomInputMissing(elements.targetDelimiter, elements.targetCustomDelimiter)) return false;

    return (
      getDelimiter(elements.sourceDelimiter, elements.sourceCustomDelimiter) ===
      getDelimiter(elements.targetDelimiter, elements.targetCustomDelimiter)
    );
  }

  // Updates convert button disabled state based on current validation rules.
  function updateConvertButtonState() {
    elements.button.disabled =
      isCustomInputMissing(elements.sourceDelimiter, elements.sourceCustomDelimiter) ||
      isCustomInputMissing(elements.targetDelimiter, elements.targetCustomDelimiter) ||
      areDelimitersEqual();
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

      const source = getDelimiter(elements.sourceDelimiter, elements.sourceCustomDelimiter);
      const target = getDelimiter(elements.targetDelimiter, elements.targetCustomDelimiter);
      const parts = splitByDelimiter(text, elements.sourceDelimiter.value, source);

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
  function handleDelimiterSelectChange(selectEl, inputEl) {
    toggleCustomInput(selectEl, inputEl);
    updateConvertButtonState();
    saveDelimiterSettings();
    if (selectEl.value === 'custom') {
      inputEl.focus();
    }
  }

  // Handles custom delimiter input updates and persistence.
  function handleCustomDelimiterInput(inputEl) {
    limitToOneCharacter(inputEl);
    updateConvertButtonState();
    saveDelimiterSettings();
  }

  elements.sourceDelimiter.addEventListener('change', () => {
    handleDelimiterSelectChange(elements.sourceDelimiter, elements.sourceCustomDelimiter);
  });
  elements.targetDelimiter.addEventListener('change', () => {
    handleDelimiterSelectChange(elements.targetDelimiter, elements.targetCustomDelimiter);
  });
  elements.sourceCustomDelimiter.addEventListener('input', () => {
    handleCustomDelimiterInput(elements.sourceCustomDelimiter);
  });
  elements.targetCustomDelimiter.addEventListener('input', () => {
    handleCustomDelimiterInput(elements.targetCustomDelimiter);
  });

  applyDelimiterSettings(loadDelimiterSettings());
  toggleAllCustomInputs();
  updateConvertButtonState();
  saveDelimiterSettings();
  setDelimiterOptionsVisible(false);
  elements.toggleOptionsButton.addEventListener('click', () => {
    setDelimiterOptionsVisible(elements.delimiterOptions.hidden);
  });
  elements.button.addEventListener('click', convertClipboard);
});
