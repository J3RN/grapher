# Grapher

![A call graph of the Elixir library "Gollum"](./gollum.png)

The goal of this project is to visualize call graphs from JSON files with the format:
```
{
  "nodes": [
    {"module": ["Foo", "Bar"], "function": "baz/1"},
    {"module": ["Kernel"], "function": "to_string/1"}
  ],
  "edges": [
    {
      "source": {"module": ["Foo", "Bar"], "function": "baz/1"},
      "target": {"module": ["Kernel"], "function": "to_string/1"}
    }
  ]
}
```

A live version may be used at https://j3rn.com/grapher
