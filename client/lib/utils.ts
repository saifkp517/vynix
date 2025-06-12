"use client"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { useRef, useEffect } from "react";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function useWhyDidYouUpdate(componentName: string, props: any) {
  const previousProps = useRef<any>({});

  useEffect(() => {
    const allKeys = Object.keys({ ...previousProps.current, ...props });
    const changesObj: any = {};

    allKeys.forEach(key => {
      if (previousProps.current[key] !== props[key]) {
        changesObj[key] = {
          from: previousProps.current[key],
          to: props[key],
        };
      }
    });

    if (Object.keys(changesObj).length) {
      console.log(`[why-did-you-update] ${componentName}`, changesObj);
    }

    previousProps.current = props;
  });
}