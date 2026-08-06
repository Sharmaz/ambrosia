import { useState } from "react";

/**
 * Faithful mock of HeroUI's NumberInput, mirroring the two argument types it calls
 * `onChange` with (see `@heroui/number-input/dist/use-number-input.js`):
 *
 * - typing  -> `chain(inputProps.onChange, onChange)` hands over a DOM event, and
 *              `onValueChange` does NOT fire (the state only stores the input string).
 * - stepper -> `useNumberFieldState({ onChange: chain(onValueChange, onChange) })`
 *              hands over a number to both props. Same path for the wheel, the arrow
 *              keys and the commit on blur/Enter.
 *
 * Like the real component it keeps the typed text in its own state and only resyncs
 * it when the `value` prop changes, so a controlled parent that ignores the DOM path
 * does not wipe what the test typed.
 *
 * Tests drive the numeric path with the stepper buttons or by blurring the input.
 * `jest.mock` factories are hoisted, so pull it in from inside the factory:
 * `NumberInput: require("@/test-utils/numberInputMock").NumberInputMock`
 */
const formatValue = (value) => (Number.isFinite(Number(value)) && value !== null && value !== ""
  ? String(value)
  : "");

export function NumberInputMock({
  label,
  "aria-label": ariaLabel,
  value,
  onValueChange,
  onChange,
  onKeyDown,
  minValue,
  maxValue,
  step = 1,
  isDisabled,
  placeholder,
  "data-testid": testId,
}) {
  const [inputText, setInputText] = useState(() => formatValue(value));
  const [previousValue, setPreviousValue] = useState(value);
  const accessibleLabel = ariaLabel ?? label;

  if (!Object.is(value, previousValue)) {
    setPreviousValue(value);
    setInputText(formatValue(value));
  }

  const emitNumericValue = (numericValue) => {
    const clampedValue = (() => {
      if (Number.isNaN(numericValue)) return NaN;
      if (minValue != null && numericValue < minValue) return minValue;
      if (maxValue != null && numericValue > maxValue) return maxValue;
      return numericValue;
    })();

    setInputText(formatValue(clampedValue));
    onValueChange?.(clampedValue);
    onChange?.(clampedValue);
  };

  const stepBy = (direction) => {
    const currentValue = Number.isFinite(Number(inputText)) && inputText !== ""
      ? Number(inputText)
      : 0;
    emitNumericValue(currentValue + (direction * Number(step)));
  };

  const commit = () => {
    emitNumericValue(parseFloat(inputText.replace(/[^0-9.-]/g, "")));
  };

  return (
    <div>
      <input
        aria-label={accessibleLabel}
        data-testid={testId}
        disabled={isDisabled}
        placeholder={placeholder}
        value={inputText}
        onChange={(domChangeEvent) => {
          setInputText(domChangeEvent.target.value);
          onChange?.(domChangeEvent);
        }}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        aria-label={`${accessibleLabel} increment`}
        onClick={() => stepBy(1)}
      />
      <button
        type="button"
        aria-label={`${accessibleLabel} decrement`}
        onClick={() => stepBy(-1)}
      />
    </div>
  );
}
