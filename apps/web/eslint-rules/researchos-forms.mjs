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
 * | `no-native-form-controls` | Form controls are Chakra components |
 * | `form-must-use-react-hook-form` | A `<form>` is driven by `useForm` |
 * | `form-must-handle-submit` | A `<form>` has an `onSubmit` |
 * | `form-control-must-be-wired` | Every Chakra control is registered or controlled |
 * | `form-error-must-be-resolved` | A field error is resolved through the catalog |
 *
 * The rules live here rather than in `eslint.config.mjs` because they need
 * to reason about JSX and imports, not just paths.
 */

const NATIVE_CHAKRA_CONTROLS = new Set(['Input', 'Textarea', 'NativeSelect.Field']);
const SHARED_FORM_CONTROLS = new Set(['FormTextField', 'FormSelect', 'FormCheckbox']);
const COMPOUND_CONTROL_BINDINGS = new Map([
  ['Select.Root', ['value', 'onValueChange']],
  ['Checkbox.Root', ['checked', 'onCheckedChange']],
  ['RadioGroup.Root', ['value', 'onValueChange']],
  ['Switch.Root', ['checked', 'onCheckedChange']],
  ['Slider.Root', ['value', 'onValueChange']],
  ['Combobox.Root', ['value', 'onValueChange']],
  ['NumberInput.Root', ['value', 'onValueChange']],
]);

function chakraImports(program) {
  const names = new Map();
  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') continue;
    if (statement.source.value !== '@chakra-ui/react') continue;
    for (const specifier of statement.specifiers) {
      if (
        specifier.type === 'ImportSpecifier' &&
        specifier.imported.type === 'Identifier'
      ) {
        names.set(specifier.local.name, specifier.imported.name);
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        names.set(specifier.local.name, '');
      }
    }
  }
  return names;
}

function controlName(node, chakraNames) {
  if (node.type === 'JSXIdentifier') {
    return chakraNames.get(node.name) ?? node.name;
  }
  if (node.type !== 'JSXMemberExpression') return null;
  const owner = controlName(node.object, chakraNames);
  return owner ? `${owner}.${node.property.name}` : node.property.name;
}

/**
 * The native HTML form controls.
 *
 * `input` is allowed in its `type="hidden"` form: react-hook-form needs a
 * real DOM input for a hidden field, and it is the one case where a native
 * element is clearer than a Chakra one.
 */
const NATIVE_CONTROLS = new Set(['input', 'select', 'textarea']);

/**
 * Returns the local name of a JSX element.
 *
 * A member expression is matched on its last segment.
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
 * Collects whole registrations and rest bindings such as `registration`.
 * ```typescript
 * const { ref, ...registration } = register('title');
 * ```
 *
 */
function registerResultNames(program) {
  const names = new Set();

  function walkBody(body) {
    for (const statement of body) {
      if (statement.type === 'VariableDeclaration') {
        for (const declarator of statement.declarations) {
          const id = declarator.id;

          if (!isRegisterCall(declarator.init)) continue;
          if (id.type === 'Identifier') {
            names.add(id.name);
            continue;
          }
          if (id.type !== 'ObjectPattern') continue;

          for (const property of id.properties) {
            if (
              property.type === 'RestElement' &&
              property.argument.type === 'Identifier'
            ) {
              names.add(property.argument.name);
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

function isRegisterCall(node) {
  if (node?.type !== 'CallExpression') return false;
  const callee = node.callee;
  return (
    (callee.type === 'Identifier' && callee.name === 'register') ||
    (callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.name === 'register')
  );
}

function hasAllAttributes(node, names) {
  return names.every((name) => hasAttribute(node, name));
}

function hasNativeBinding(node, registeredNames) {
  return (
    hasAllAttributes(node, ['value', 'onChange']) ||
    hasAllAttributes(node, ['checked', 'onChange']) ||
    hasAllAttributes(node, ['name', 'onChange', 'onBlur', 'ref']) ||
    spreadsOf(node).some(
      ({ argument }) =>
        isRegisterCall(argument) ||
        (argument.type === 'Identifier' &&
          (argument.name === 'field' || registeredNames.has(argument.name))),
    )
  );
}

const noNativeFormControls = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Chakra form components instead of native HTML form controls.',
    },
    schema: [],
    messages: {
      nativeControl:
        'Use a Chakra field such as Input, Textarea, or NativeSelect.Field in place of a native `<{{element}}>`. Hidden inputs may be rendered directly.',
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
            (type?.type === 'Literal' && type.value === 'hidden') ||
            (type?.type === 'JSXExpressionContainer' &&
              type.expression.type === 'Literal' &&
              type.expression.value === 'hidden')
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
        'Require every Chakra form control in a react-hook-form file to be registered or controlled.',
    },
    schema: [],
    messages: {
      notWired:
        'Bind `<{{element}}>` with register() or pass the Controller field props.',
      missingFieldName:
        'Pass a field name to `<{{element}}>` so it can register with the form.',
      missingCompoundBinding:
        'Bind `<{{element}}>` with Controller. Pass `{{valueProp}}` and adapt `{{changeProp}}` to field.onChange.',
    },
  },

  create(context) {
    const bindings = reactHookFormBindings(context.sourceCode.ast);

    // The rule only applies to a file that uses react-hook-form. A
    // display-only field on a settings screen is not a form control.
    if (!bindings.has('useForm') && !bindings.has('Controller')) return {};

    const program = context.sourceCode.ast;
    const chakraNames = chakraImports(program);
    const registeredNames = registerResultNames(program);

    return {
      JSXOpeningElement(node) {
        const element = controlName(node.name, chakraNames);
        const compoundBinding = COMPOUND_CONTROL_BINDINGS.get(element);

        if (compoundBinding) {
          if (hasAllAttributes(node, compoundBinding)) return;
          const [valueProp, changeProp] = compoundBinding;
          context.report({
            node,
            messageId: 'missingCompoundBinding',
            data: { element, valueProp, changeProp },
          });
        } else if (
          NATIVE_CHAKRA_CONTROLS.has(element) &&
          !hasNativeBinding(node, registeredNames)
        ) {
          context.report({ node, messageId: 'notWired', data: { element } });
        } else if (
          SHARED_FORM_CONTROLS.has(element) &&
          !hasAttribute(node, 'name')
        ) {
          context.report({ node, messageId: 'missingFieldName', data: { element } });
        }
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
      JSXExpressionContainer(node) {
        checkExpression(node.expression);
      },
    };
  },
};

export const researchosFormRules = {
  'no-native-form-controls': noNativeFormControls,
  'form-must-use-react-hook-form': formMustUseReactHookForm,
  'form-must-handle-submit': formMustHandleSubmit,
  'form-control-must-be-wired': formControlMustBeWired,
  'form-error-must-be-resolved': formErrorMustBeResolved,
};
