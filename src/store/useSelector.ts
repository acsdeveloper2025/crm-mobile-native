import { useEffect, useRef, useState } from 'react';
import { ProjectionStore, type ProjectionSelector } from './ProjectionStore';

export const shallowEqual = <T,>(previous: T, next: T): boolean => {
  if (Object.is(previous, next)) {
    return true;
  }

  if (Array.isArray(previous) && Array.isArray(next)) {
    if (previous.length !== next.length) {
      return false;
    }
    for (let index = 0; index < previous.length; index += 1) {
      if (!Object.is(previous[index], next[index])) {
        return false;
      }
    }
    return true;
  }

  if (
    previous &&
    next &&
    typeof previous === 'object' &&
    typeof next === 'object'
  ) {
    const previousRecord = previous as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const previousKeys = Object.keys(previousRecord);
    const nextKeys = Object.keys(nextRecord);
    if (previousKeys.length !== nextKeys.length) {
      return false;
    }
    for (const key of previousKeys) {
      if (!Object.prototype.hasOwnProperty.call(nextRecord, key)) {
        return false;
      }
      if (!Object.is(previousRecord[key], nextRecord[key])) {
        return false;
      }
    }
    return true;
  }

  return false;
};

export const useSelector = <T,>(selector: ProjectionSelector<T>): T => {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const selectorKey = selector.key;

  const equalityFn = selector.equalityFn || shallowEqual<T>;
  const [selectedValue, setSelectedValue] = useState<T>(() => ProjectionStore.select(selector));

  useEffect(() => {
    const currentSelector = selectorRef.current;
    setSelectedValue(ProjectionStore.select(currentSelector));

    const unsubscribe = ProjectionStore.subscribe(
      currentSelector,
      nextValue => {
        setSelectedValue(currentValue =>
          equalityFn(currentValue, nextValue) ? currentValue : nextValue,
        );
      },
      equalityFn,
    );

    ProjectionStore.ensureSelector(currentSelector).catch(() => undefined);

    return unsubscribe;
  }, [equalityFn, selectorKey]);

  return selectedValue;
};
