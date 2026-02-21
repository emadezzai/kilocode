<?php

namespace BaseNamespace {
    class BaseClass
    {
        public function __construct()
        {
        }
    }
    class Person
    {
        public function getAddress(): Address
        {
            return new Address();
        }
    }
    class Address
    {
    }
}

namespace BaseNamespace\Interfaces {
    interface FirstInterface
    {
    }
    interface SecondInterface
    {
    }
}