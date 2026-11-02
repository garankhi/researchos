/**
 * ESLint rules that enforce the ResearchOS form conventions.
 *
 * The conventions live in the `researchos-forms` skill. Prose does not fail
 * a build, so a form that hand-rolls its state, renders a raw `<input>`,
 * or forgets to wire a control into the form would only be caught in
 * review — and a control that is not wired is the worst kind of bug: the
 * form submits, the field is silently empty, and the server rejects it.
 *
 * | Rule | Convention |
 * | --- | --- |
 * | `no-native-form-controls` | Form controls are MUI components |
 * | `form-must-use-react-hook-form` | A `<form>` is driven by `useForm` |
 * | `form-must-handle-submit` | A `<form>` has an `onSubmit` |
 * | `form-control-must-be-wired` | Every MUI control is registered or controlled |
 * | `select-requires-controller` | MUI's `select` needs `Controller`, not `register` |
 * | `form-error-must-be-resolved` | A field error is resolved through the catalog |
 *
 * The rules live here rather than in `eslint.config.mjs` because they need
 * to reason about JSX and imports, not just paths.
 */

/**
 * The MUI components that represent a single form control.
 *
 * A control is one the user fills in, and therefore one that must be
 * registered with the form. Layout wrappers (`FormControl`,
 * `FormHelperText`, `FormLabel`, `FormGroup`, `InputLabel`) are not
 * controls and are deliberately absent.
 */
const FORM_CONTROLS = new Set([
  'TextField',
  'Select',
  'Checkbox',
  'Radio',
  'RadioGroup',
  'Switch',
  'Slider',
  'Autocomplete',
]);

/**
 * The native HTML form controls.
 *
 * `input` is allowed in its `type="hidden"` form: react-hook-form needs a
 * real DOM input for a hidden field, and it is the one case where a native
 * element is clearer than a MUI one.
 */
const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea']);

/**
 * Returns the local name of a JSX element.
 *
 * `<TextField />` is `TextField`; `<Mui.TextField />` is `TextField`; a
 * member expression is matched on its last segment, so a namespaced import
 * is caught the same way a direct one is.
 */
function elementName(node) {
  if (!node) return null;

  if (node.type === 'JSXIdentifier') {
    return node.name;
  }

  if (node.type === 'JSXMemberExpression') {
    return elementName(node.property);
  }

  return null;
}

/**
 * Returns the names a module binds from `react-hook-form`.
 *
 * The file counts as a react-hook-form file when it imports `useForm` —
 * that is the hook that makes a form a form — or any other binding from
 * the package.
 */
function reactHookFormBindings(program) {
  const bindings = new Set();

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    if (statement.source.value !== 'react-hook-form') continue;

    for (const specifier of statement.specifiers) {
      if (specifier.type === 'ImportSpecifier') {
        bindings.add(specifier.imported.name);
      } else if (specifier.type === 'ImportDefaultSpecifier') {
        bindings.add('default');
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        bindings.add('*');
      }
    }
  }

  return bindings;
}

/**
 * Collects the local names that a `register()` call was destructured into.
 *
 * ```typescript
 * const { ref, ...registration } = register('title');
 * ```
 *
 * The MUI `TextField` needs the ref split out from the rest of the
 * registration, because MUI forwards `ref` to the root element and
 * `inputRef` to the DOM input. The spread of the remaining properties —
 * `{...registration}` — is what binds the control.
 *
 * The rule has to recognise the pattern, otherwise it would flag the
 * primitives that exist to make the convention easy to follow.
 */
function destructuredRegisterNames(program) {
  const names = new Set();

  /**
   * Returns `true` when the initializer is a `register()` call.
   *
   * The field name is not checked: `register('title')` and a dynamic
   * `register(name)` are both registrations.
   */
  function isRegisterCall(declarator) {
    const init = declarator.init;

    if (!init || init.type !== 'CallExpression') return false;
    if (init.callee.type !== 'Identifier' || init.callee.name !== 'register') {
      return false;
    }

    return true;
  }

  function walkBody(body) {
    for (const statement of body) {
      if (statement.type === 'VariableDeclaration') {
        for (const declarator of statement.declarations) {
          const id = declarator.id;

          if (id.type !== 'ObjectPattern') continue;

          // Only a `register()` call counts. A destructure of anything else
          // is not a registration.
          if (!isRegisterCall(declarator)) continue;

          for (const property of id.properties) {
            // The rest element — `{...registration}` — is the spread that
            // binds the control, so its name is what the rule looks for.
            if (property.type === 'RestElement') {
              if (property.argument.type === 'Identifier') {
                names.add(property.argument.name);
              }

              continue;
            }

            if (property.type !== 'Property') continue;
            if (property.key.type !== 'Identifier') continue;
            if (property.key.name !== 'ref') continue;

            // A shorthand `{ ref }` binds the ref on its own. The control
            // still needs the rest of the registration, so this shape on
            // its own does not bind it.
            if (property.shorthand) continue;

            if (property.value.type === 'Identifier') {
              names.add(property.value.name);
            }
          }
        }
      }

      // The pattern usually sits inside a component body, so the walk has
      // to descend into every function form — a declaration, an arrow
      // function expression, or a method.
      walkNode(statement);
    }
  }

  /**
   * Descends into the function bodies nested inside a statement.
   */
  function walkNode(node) {
    if (!node || typeof node !== 'object') return;

    switch (node.type) {
      case 'FunctionDeclaration':
      case 'FunctionExpression':
      case 'ArrowFunctionExpression':
        if (node.body && node.body.type === 'BlockStatement') {
          walkBody(node.body.body);
        }
        return;

      case 'VariableDeclaration':
        for (const declarator of node.declarations) {
          if (declarator.init) walkNode(declarator.init);
        }
        return;

      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        if (node.declaration) walkNode(node.declaration);
        return;

      default:
        return;
    }
  }

  walkBody(program.body);

  return names;
}

/**
 * Returns the value of a JSX attribute, or `undefined` when the attribute
 * is absent.
 */
function attributeOf(openingElement, name) {
  for (const attribute of openingElement.attributes) {
    if (attribute.type !== 'JSXAttribute') continue;
    if (attribute.name.type !== 'JSXIdentifier') continue;
    if (attribute.name.name !== name) continue;

    return attribute.value;
  }

  return undefined;
}

/**
 * Returns `true` when the element carries the given attribute at all.
 */
function hasAttribute(openingElement, name) {
  return attributeOf(openingElement, name) !== undefined;
}

/**
 * Returns the spread attributes of an element.
 */
function spreadsOf(openingElement) {
  return openingElement.attributes.filter(
    (attribute) => attribute.type === 'JSXSpreadAttribute',
  );
}

/**
 * Unwraps a `ChainExpression`.
 *
 * `a?.b` parses as a `ChainExpression` around the `MemberExpression`, so
 * without this the optional access in `errors.title?.message` would slip
 * past the check.
 */
function unwrapChain(node) {
  if (node && node.type === 'ChainExpression') {
    return node.expression;
  }

  return node;
}

/**
 * Returns `true` when the expression chain mentions an `errors` binding.
 *
 * `formState.errors`, `errors` and `errors.title` all count — what matters
 * is that the value came from a form's error state.
 */
function mentionsErrors(node) {
  node = unwrapChain(node);

  if (!node) return false;

  if (node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression') {
    if (node.property.type === 'Identifier' && node.property.name === 'errors') {
      return true;
    }

    return mentionsErrors(node.object);
  }

  if (node.type === 'Identifier') {
    return node.name === 'errors';
  }

  return false;
}

/**
 * Returns `true` when the element is bound to the form.
 *
 * A control is bound when it is registered (`{...register('title')}`),
 * controlled by a `Controller` (`{...field}` or explicit `value` +
 * `onChange`), or carries a `name` of its own.
 *
 * A toggle reports its state through `checked`, not `value` — MUI's
 * `Checkbox`, `Switch` and `Radio` all use it — so `checked` + `onChange`
 * counts as bound too.
 *
 * @param {object} openingElement The JSX opening element.
 * @param {Set<string>} registeredNames The names bound from a destructured
 *   `register()` call, so a `{...registration}` spread counts as bound.
 */
function isBoundToForm(openingElement, registeredNames) {
  if (hasAttribute(openingElement, 'name')) {
    return true;
  }

  const hasChange = hasAttribute(openingElement, 'onChange');

  if (hasChange) {
    if (hasAttribute(openingElement, 'value')) {
      return true;
    }

    if (hasAttribute(openingElement, 'checked')) {
      return true;
    }
  }

  for (const spread of spreadsOf(openingElement)) {
    const argument = spread.argument;

    // `{...register('title')}` — the spread brings the name with it.
    if (argument.type === 'CallExpression') {
      const callee = argument.callee;

      if (callee.type === 'Identifier' && callee.name === 'register') {
        return true;
      }

      continue;
    }

    // `{...field}` — the `Controller` render prop's field object.
    if (argument.type === 'Identifier' && argument.name === 'field') {
      return true;
    }

    // `{...registration}` — the rest of a destructured `register()` call.
    if (
      argument.type === 'Identifier' &&
      registeredNames.has(argument.name)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Returns `true` when the element is registered with `register()`.
 *
 * Both the inline spread (`{...register('title')}`) and the destructured
 * one (`const { ref, ...registration } = register('title')`) count — the
 * second is the shape MUI's `TextField` needs, because it takes the ref
 * separately.
 */
function isRegisteredWithRegister(openingElement, registeredNames) {
  if (
    spreadsOf(openingElement).some((spread) => {
      const argument = spread.argument;

      return (
        argument.type === 'CallExpression' &&
        argument.callee.type === 'Identifier' &&
        argument.callee.name === 'register'
      );
    })
  ) {
    return true;
  }

  return spreadsOf(openingElement).some((spread) => {
    const argument = spread.argument;

    return (
      argument.type === 'Identifier' && registeredNames.has(argument.name)
    );
  });
}

const noNativeFormControls = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require MUI form components instead of native HTML form controls.',
    },
    schema: [],
    messages: {
      nativeControl:
        'Native `<{{element}}>` is not allowed — use the MUI equivalent (`TextField`, `Select`, `Checkbox`, …) so the control inherits the theme, the dark mode and the shared styling. The only exception is `<input type="hidden">`, which react-hook-form needs for a hidden field.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        const name = elementName(node.name);

        if (!name || !NATIVE_CONTROLS.has(name)) return;

        // A hidden input is a real DOM input on purpose.
        if (name === 'input') {
          const type = attributeOf(node, 'type');

          if (
            type &&
            type.type === 'JSXExpressionContainer' &&
            type.expression.type === 'Literal' &&
            type.expression.value === 'hidden'
          ) {
            return;
          }
        }

        context.report({
          node,
          messageId: 'nativeControl',
          data: { element: name },
        });
      },
    };
  },
};

const formMustUseReactHookForm = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every `<form>` element to be driven by react-hook-form\'s `useForm`.',
    },
    schema: [],
    messages: {
      noUseForm:
        'This `<form>` is not driven by react-hook-form. Call `useForm` from `react-hook-form` and build the form on it — a form with hand-rolled `useState` per field cannot show which field failed, cannot reset, and cannot map server-side field errors back onto the inputs.',
    },
  },

  create(context) {
    const bindings = reactHookFormBindings(context.sourceCode.ast);

    if (bindings.has('useForm')) return {};

    return {
      JSXOpeningElement(node) {
        if (elementName(node.name) !== 'form') return;

        context.report({ node, messageId: 'noUseForm' });
      },
    };
  },
};

const formMustHandleSubmit = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require every `<form>` element to handle its submit event.',
    },
    schema: [],
    messages: {
      noSubmit:
        'This `<form>` has no `onSubmit`, so submitting it reloads the page and discards the state. Pass `handleSubmit(...)` from `useForm` to `onSubmit`.',
    },
  },

  create(context) {
    return {
      JSXOpeningElement(node) {
        if (elementName(node.name) !== 'form') return;
        if (hasAttribute(node, 'onSubmit')) return;

        context.report({ node, messageId: 'noSubmit' });
      },
    };
  },
};

const formControlMustBeWired = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every MUI form control in a react-hook-form file to be registered or controlled.',
    },
    schema: [],
    messages: {
      notWired:
        '`<{{element}}>` is not bound to the form, so its value is never submitted and never validated. Register it with `{{...register(\'name\')}}`, or wrap it in a `<Controller>` and spread `{{...field}}` — or pass `value` and `onChange` explicitly.',
    },
  },

  create(context) {
    const bindings = reactHookFormBindings(context.sourceCode.ast);

    // The rule only applies to a file that uses react-hook-form. A
    // display-only field on a settings screen is not a form control.
    if (!bindings.has('useForm') && !bindings.has('Controller')) return {};

    const registeredNames = destructuredRegisterNames(context.sourceCode.ast);

    return {
      JSXOpeningElement(node) {
        const name = elementName(node.name);

        if (!name || !FORM_CONTROLS.has(name)) return;
        if (isBoundToForm(node, registeredNames)) return;

        context.report({
          node,
          messageId: 'notWired',
          data: { element: name },
        });
      },
    };
  },
};

const selectRequiresController = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow `register()` on a MUI select, which requires a `Controller`.',
    },
    schema: [],
    messages: {
      selectNeedsController:
        'A MUI `select` cannot be registered with `register()` — MUI\'s `Select` renders a hidden input plus a listbox, so the spread does not drive the displayed value. Wrap it in a `<Controller>` and pass `value` and `onChange` from `field`.',
    },
  },

  create(context) {
    const registeredNames = destructuredRegisterNames(context.sourceCode.ast);

    return {
      JSXOpeningElement(node) {
        const name = elementName(node.name);

        if (name !== 'TextField') return;
        if (!hasAttribute(node, 'select')) return;
        if (!isRegisteredWithRegister(node, registeredNames)) return;

        context.report({ node, messageId: 'selectNeedsController' });
      },
    };
  },
};

const formErrorMustBeResolved = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a field error message to be resolved through the message catalog.',
    },
    schema: [],
    messages: {
      rawError:
        'This renders the field error message directly. The message is a **code** (`title_required`), not a sentence — resolve it with `resolveErrorCode(t, code, t(\'unknown\'))` so the user reads it in their own language. The raw code must never reach the screen.',
    },
  },

  create(context) {
    const bindings = reactHookFormBindings(context.sourceCode.ast);

    if (!bindings.has('useForm') && !bindings.has('Controller')) return {};

    /**
     * Flags an expression that renders the error message on its own.
     *
     * The expression must be the member chain itself. Wrapping it in a call
     * — `resolveErrorCode(t, errors.title?.message, …)` — is the
     * intended fix, and is allowed.
     */
    function checkExpression(node) {
      if (!node) return;

      const expression = unwrapChain(node);

      if (
        expression.type === 'MemberExpression' ||
        expression.type === 'OptionalMemberExpression'
      ) {
        if (
          expression.property.type === 'Identifier' &&
          expression.property.name === 'message' &&
          mentionsErrors(expression.object)
        ) {
          context.report({ node, messageId: 'rawError' });
          return;
        }
      }
    }

    return {
      // Only the attribute visitor is needed: a JSX expression container
      // inside an attribute is visited twice (once by the attribute, once
      // by the container), which would report the same node twice.
      JSXAttribute(node) {
        const value = node.value;

        if (!value || value.type !== 'JSXExpressionContainer') return;

        checkExpression(value.expression);
      },
    };
  },
};

export const researchosFormRules = {
  'no-native-form-controls': noNativeFormControls,
  'form-must-use-react-hook-form': formMustUseReactHookForm,
  'form-must-handle-submit': formMustHandleSubmit,
  'form-control-must-be-wired': formControlMustBeWired,
  'select-requires-controller': selectRequiresController,
  'form-error-must-be-resolved': formErrorMustBeResolved,
};
